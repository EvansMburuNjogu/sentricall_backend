package com.ke.sentricall

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.view.View
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.log10
import kotlin.random.Random

class SessionActivity : AppCompatActivity(), ScreenRecordingService.RecordingCallback {

    companion object {
        const val EXTRA_SESSION_TYPE_ID = "extra_session_type_id"
        const val EXTRA_SESSION_TITLE = "extra_session_title"
        const val EXTRA_SESSION_SUBTITLE = "extra_session_subtitle"
    }

    // UI
    private lateinit var btnBack: ImageButton
    private lateinit var tvSessionHeaderTitle: TextView
    private lateinit var tvSessionHeaderSubtitle: TextView

    private lateinit var imgSessionIcon: ImageView
    private lateinit var tvSessionTypeTitle: TextView
    private lateinit var tvSessionTypeBody: TextView

    private lateinit var audioSpectrumView: AudioSpectrumView
    private lateinit var tvSessionTimer: TextView

    private lateinit var cardSessionType: MaterialCardView
    private lateinit var cardAiAnalysis: MaterialCardView
    private lateinit var tvAiAnalysisTitle: TextView
    private lateinit var tvAiAnalysisBody: TextView
    private lateinit var tvOpenAiChatLink: TextView

    // Upload UI
    private lateinit var layoutFileUpload: MaterialCardView
    private lateinit var tvFileUploadHint: TextView

    // Website URL UI
    private lateinit var layoutWebsiteUrl: TextInputLayout
    private lateinit var etWebsiteUrl: TextInputEditText

    private lateinit var btnStartStop: MaterialButton

    private lateinit var cardLastRecording: MaterialCardView
    private lateinit var btnPlayLastRecording: ImageButton
    private lateinit var tvLastRecordingTitle: TextView
    private lateinit var tvLastRecordingSubtitle: TextView

    private lateinit var btnReportSession: MaterialButton

    // State
    private var sessionMode: SessionMode = SessionMode.LISTEN_AUDIO

    // --- Audio listen state ---
    private var isListening = false
    private var mediaRecorder: MediaRecorder? = null
    private var audioOutputPath: String? = null
    private var audioStartTime: Long = 0L
    private var lastRecordingDurationSec: Int = 0

    // Playback for last saved audio
    private var playbackPlayer: MediaPlayer? = null
    private var isPlayingRecording: Boolean = false

    // Mic permission
    private var pendingStartAfterPermission = false

    // Timer for audio recording
    private val timerHandler = Handler(Looper.getMainLooper())
    private val timerRunnable = object : Runnable {
        override fun run() {
            if (!isListening) return
            val elapsed = System.currentTimeMillis() - audioStartTime
            val seconds = (elapsed / 1000).toInt()
            lastRecordingDurationSec = seconds
            val mins = seconds / 60
            val secs = seconds % 60
            tvSessionTimer.text = String.format("%02d:%02d", mins, secs)
            timerHandler.postDelayed(this, 1000L)
        }
    }

    // Spectrum animation driven by mic levels
    private val spectrumHandler = Handler(Looper.getMainLooper())
    private var lastNormLevel: Float = 0f
    private val spectrumRunnable = object : Runnable {
        override fun run() {
            if (!isListening || mediaRecorder == null) return

            val amp = mediaRecorder?.maxAmplitude ?: 0
            val silenceThreshold = 1500

            val rawNorm = if (amp <= silenceThreshold) {
                0f
            } else {
                val db = 20 * log10(amp.toDouble() / 32767.0).toFloat()
                ((db + 40f) / 40f).coerceIn(0f, 1f)
            }

            val smoothed = 0.7f * lastNormLevel + 0.3f * rawNorm
            lastNormLevel = smoothed

            val barCount = 48
            val base = lastNormLevel

            val levels = if (base <= 0.01f) {
                FloatArray(barCount) { 0f }
            } else {
                FloatArray(barCount) { index ->
                    val center = (barCount - 1) / 2f
                    val dist = kotlin.math.abs(index - center)
                    val falloff = (1f - dist / center).coerceIn(0.4f, 1f)
                    val jitter = (Random.nextFloat() - 0.5f) * 0.15f
                    (base * falloff + jitter).coerceIn(0f, 1f)
                }
            }

            audioSpectrumView.setLevels(levels)
            spectrumHandler.postDelayed(this, 70L)
        }
    }

    // Upload & scan
    private var currentUploadUri: Uri? = null

    // Last recording (audio or screen)
    private var lastRecordingPath: String? = null
    private var lastRecordingLabel: String = "Last recording"

    // region Activity result launchers

    private val pickMediaLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val dataUri = result.data?.data
                if (dataUri != null) {
                    currentUploadUri = dataUri
                    val displayName = getDisplayNameFromUri(dataUri)
                    tvFileUploadHint.text = displayName ?: "File selected"
                    tvFileUploadHint.setTextColor(
                        ContextCompat.getColor(this, android.R.color.white)
                    )
                } else {
                    Toast.makeText(this, "No file selected", Toast.LENGTH_SHORT).show()
                }
            }
        }

    private val requestAudioPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                if (pendingStartAfterPermission) {
                    pendingStartAfterPermission = false
                    actuallyStartAudioMonitoring()
                }
            } else {
                pendingStartAfterPermission = false
                Toast.makeText(
                    this,
                    "Microphone permission is needed to listen for audio.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }

    private val screenCaptureLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                val dataIntent: Intent = result.data!!
                val serviceIntent = Intent(this, ScreenRecordingService::class.java).apply {
                    action = ScreenRecordingService.ACTION_START
                    putExtra(ScreenRecordingService.EXTRA_RESULT_CODE, result.resultCode)
                    putExtra(ScreenRecordingService.EXTRA_RESULT_DATA, dataIntent)
                }

                ScreenRecordingService.recordingCallback = this
                startService(serviceIntent)
            } else {
                Toast.makeText(this, "Screen capture permission denied", Toast.LENGTH_SHORT).show()
            }
        }

    // endregion

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_session)

        // Attach as callback if service is running already
        if (ScreenRecordingService.isRunning) {
            ScreenRecordingService.recordingCallback = this
        }

        bindViews()
        setupHeaderFromIntent()
        setupModeFromIntent()
        configureUiForMode(sessionMode)
        setupListeners()
    }

    override fun onResume() {
        super.onResume()
        // Update button state when returning to activity
        if (sessionMode == SessionMode.SCREEN_RECORD) {
            updateScreenRecordingButton()
        }
    }

    // region Setup

    private fun bindViews() {
        btnBack = findViewById(R.id.btnBack)
        tvSessionHeaderTitle = findViewById(R.id.tvSessionHeaderTitle)
        tvSessionHeaderSubtitle = findViewById(R.id.tvSessionHeaderSubtitle)

        imgSessionIcon = findViewById(R.id.imgSessionIcon)
        tvSessionTypeTitle = findViewById(R.id.tvSessionTypeTitle)
        tvSessionTypeBody = findViewById(R.id.tvSessionTypeBody)

        audioSpectrumView = findViewById(R.id.audioSpectrumView)
        tvSessionTimer = findViewById(R.id.tvSessionTimer)

        cardSessionType = findViewById(R.id.cardSessionType)
        cardAiAnalysis = findViewById(R.id.cardAiAnalysis)
        tvAiAnalysisTitle = findViewById(R.id.tvAiAnalysisTitle)
        tvAiAnalysisBody = findViewById(R.id.tvAiAnalysisBody)
        tvOpenAiChatLink = findViewById(R.id.tvOpenAiChatLink)

        layoutFileUpload = findViewById(R.id.layoutFileUpload)
        tvFileUploadHint = findViewById(R.id.tvFileUploadHint)

        layoutWebsiteUrl = findViewById(R.id.layoutWebsiteUrl)
        etWebsiteUrl = findViewById(R.id.etWebsiteUrl)

        btnStartStop = findViewById(R.id.btnStartStop)

        cardLastRecording = findViewById(R.id.cardLastRecording)
        btnPlayLastRecording = findViewById(R.id.btnPlayLastRecording)
        tvLastRecordingTitle = findViewById(R.id.tvLastRecordingTitle)
        tvLastRecordingSubtitle = findViewById(R.id.tvLastRecordingSubtitle)

        btnReportSession = findViewById(R.id.btnReportSession)
    }

    private fun setupHeaderFromIntent() {
        val title = intent.getStringExtra("session_title")
            ?: intent.getStringExtra(EXTRA_SESSION_TITLE)
            ?: "Listen to audio"

        val subtitle = intent.getStringExtra("session_subtitle")
            ?: intent.getStringExtra(EXTRA_SESSION_SUBTITLE)
            ?: "Guard listens to live calls or surroundings for fraud signals."

        tvSessionHeaderTitle.text = title
        tvSessionHeaderSubtitle.text = subtitle
    }

    private fun setupModeFromIntent() {
        val modeId = intent.getStringExtra("session_mode")

        sessionMode = when (modeId) {
            "listen_audio" -> SessionMode.LISTEN_AUDIO
            "record_screen" -> SessionMode.SCREEN_RECORD
            "upload_media" -> SessionMode.UPLOAD_MEDIA
            "website_link" -> SessionMode.WEBSITE_LINK
            else -> {
                val legacyId = intent.getIntExtra(EXTRA_SESSION_TYPE_ID, -1)
                when (legacyId) {
                    1 -> SessionMode.LISTEN_AUDIO
                    2 -> SessionMode.UPLOAD_MEDIA
                    3 -> SessionMode.WEBSITE_LINK
                    4 -> SessionMode.SCREEN_RECORD
                    else -> SessionMode.LISTEN_AUDIO
                }
            }
        }
    }

    private fun configureUiForMode(mode: SessionMode) {
        audioSpectrumView.visibility = View.GONE
        tvSessionTimer.visibility = View.GONE
        layoutFileUpload.visibility = View.GONE
        layoutWebsiteUrl.visibility = View.GONE

        when (mode) {
            SessionMode.LISTEN_AUDIO -> {
                imgSessionIcon.setImageResource(android.R.drawable.ic_btn_speak_now)
                tvSessionTypeTitle.text = "Live audio monitoring"
                tvSessionTypeBody.text =
                    "Sentricall listens to your environment or call and raises flags for risky phrases."
                audioSpectrumView.visibility = View.VISIBLE
                tvSessionTimer.visibility = View.VISIBLE
                btnStartStop.text = "Start listening"
                audioSpectrumView.setLevels(FloatArray(48) { 0f })
            }

            SessionMode.UPLOAD_MEDIA -> {
                imgSessionIcon.setImageResource(android.R.drawable.ic_menu_upload)
                tvSessionTypeTitle.text = "Upload & scan"
                tvSessionTypeBody.text =
                    "Upload a voice note or screenshot and let Sentricall scan it for warning signs."
                layoutFileUpload.visibility = View.VISIBLE
                btnStartStop.text = "Scan file"
            }

            SessionMode.WEBSITE_LINK -> {
                imgSessionIcon.setImageResource(android.R.drawable.ic_menu_view)
                tvSessionTypeTitle.text = "Scan a website link"
                tvSessionTypeBody.text =
                    "Paste a website URL and Sentricall will check it for red flags."
                layoutWebsiteUrl.visibility = View.VISIBLE
                etWebsiteUrl.requestFocus()
                btnStartStop.text = "Scan link"
            }

            SessionMode.SCREEN_RECORD -> {
                imgSessionIcon.setImageResource(android.R.drawable.ic_menu_slideshow)
                tvSessionTypeTitle.text = "Screen monitoring"
                tvSessionTypeBody.text =
                    "Record your screen while you interact with a site or app. Sentricall will analyse the session."

                updateScreenRecordingButton()
            }
        }

        tvAiAnalysisTitle.text = "AI analysis for this session"
        tvAiAnalysisBody.text =
            "Once this session runs, Sentricall will generate flags and insights here."
        tvOpenAiChatLink.text = "Open detailed AI chat for this session"
    }

    private fun updateScreenRecordingButton() {
        btnStartStop.text = if (ScreenRecordingService.isRunning) {
            "Stop screen recording"
        } else {
            "Start screen recording"
        }
    }

    private fun setupListeners() {
        btnBack.setOnClickListener { finish() }

        layoutFileUpload.setOnClickListener {
            if (sessionMode == SessionMode.UPLOAD_MEDIA) {
                openMediaPicker()
            }
        }

        btnStartStop.setOnClickListener {
            when (sessionMode) {
                SessionMode.LISTEN_AUDIO -> toggleAudioMonitoring()
                SessionMode.UPLOAD_MEDIA -> handleUploadScan()
                SessionMode.WEBSITE_LINK -> handleWebsiteScan()
                SessionMode.SCREEN_RECORD -> toggleScreenRecording()
            }
        }

        btnPlayLastRecording.setOnClickListener {
            togglePlaybackOfLastRecording()
        }

        btnReportSession.setOnClickListener {
            showReportDialog()
        }
    }

    // endregion

    // region Upload & scan

    private fun openMediaPicker() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "*/*"
            putExtra(
                Intent.EXTRA_MIME_TYPES,
                arrayOf(
                    "image/png",
                    "image/jpg",
                    "image/jpeg",
                    "image/webp",
                    "audio/mpeg",
                    "audio/mp3",
                    "audio/x-m4a",
                    "audio/mp4",
                    "audio/wav",
                    "audio/ogg"
                )
            )
        }
        pickMediaLauncher.launch(Intent.createChooser(intent, "Select audio or image"))
    }

    private fun handleUploadScan() {
        if (currentUploadUri == null) {
            Toast.makeText(this, "Please pick an audio or image file first", Toast.LENGTH_SHORT)
                .show()
            return
        }
        Toast.makeText(this, "Scanning file… (AI coming later)", Toast.LENGTH_SHORT).show()
    }

    // endregion

    // region Website link

    private fun handleWebsiteScan() {
        val url = etWebsiteUrl.text?.toString()?.trim().orEmpty()
        if (url.isEmpty()) {
            layoutWebsiteUrl.error = "Please paste a website link"
            return
        }
        layoutWebsiteUrl.error = null
        Toast.makeText(this, "Scanning link… (AI coming later)", Toast.LENGTH_SHORT).show()
    }

    // endregion

    // region Audio monitoring

    private fun toggleAudioMonitoring() {
        if (isListening) {
            stopAudioMonitoring()
        } else {
            startAudioMonitoring()
        }
    }

    private fun startAudioMonitoring() {
        val hasPermission = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            pendingStartAfterPermission = true
            requestAudioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }

        actuallyStartAudioMonitoring()
    }

    private fun actuallyStartAudioMonitoring() {
        try {
            stopPlaybackInternal()

            val dir = File(getExternalFilesDir(Environment.DIRECTORY_MUSIC), "audio_sessions")
            if (!dir.exists()) dir.mkdirs()

            val dateStr =
                SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val file = File(dir, "sentricall_audio_$dateStr.m4a")
            audioOutputPath = file.absolutePath

            mediaRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128_000)
                setAudioSamplingRate(44_100)
                setOutputFile(audioOutputPath)
                prepare()
                start()
            }

            isListening = true
            audioStartTime = System.currentTimeMillis()
            lastRecordingDurationSec = 0
            tvSessionTimer.text = "00:00"
            tvSessionTimer.visibility = View.VISIBLE

            lastNormLevel = 0f
            audioSpectrumView.visibility = View.VISIBLE
            audioSpectrumView.setLevels(FloatArray(48) { 0f })

            btnStartStop.text = "Stop listening"
            timerHandler.post(timerRunnable)
            spectrumHandler.post(spectrumRunnable)

        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Error starting audio: ${e.message}", Toast.LENGTH_SHORT).show()
            isListening = false
            btnStartStop.text = "Start listening"
            timerHandler.removeCallbacks(timerRunnable)
            spectrumHandler.removeCallbacks(spectrumRunnable)
            audioSpectrumView.setLevels(FloatArray(48) { 0f })
        }
    }

    private fun stopAudioMonitoring() {
        try {
            isListening = false
            timerHandler.removeCallbacks(timerRunnable)
            spectrumHandler.removeCallbacks(spectrumRunnable)

            mediaRecorder?.apply {
                try {
                    stop()
                } catch (_: Exception) {
                }
                reset()
                release()
            }
            mediaRecorder = null

            btnStartStop.text = "Start listening"
            audioSpectrumView.setLevels(FloatArray(48) { 0f })

            audioOutputPath?.let { path ->
                lastRecordingPath = path
                lastRecordingLabel = "Last audio session"
                cardLastRecording.visibility = View.VISIBLE
                tvLastRecordingTitle.text = lastRecordingLabel
                tvLastRecordingSubtitle.text =
                    formatDurationLabel(lastRecordingDurationSec, playing = false)
            }

        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Error stopping audio: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    // endregion

    // region Screen recording

    private fun toggleScreenRecording() {
        if (ScreenRecordingService.isRunning) {
            // Stop the running recording (no permission dialog here)
            stopScreenRecording()
        } else {
            // Start a new recording (will show "Share your screen" dialog)
            startScreenRecording()
        }
    }

    private fun startScreenRecording() {
        requestScreenCapture()
    }

    private fun stopScreenRecording() {
        val stopIntent = Intent(this, ScreenRecordingService::class.java).apply {
            action = ScreenRecordingService.ACTION_STOP
        }
        startService(stopIntent)
    }

    private fun requestScreenCapture() {
        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                as android.media.projection.MediaProjectionManager
        val intent = mgr.createScreenCaptureIntent()
        screenCaptureLauncher.launch(intent)
    }

    override fun onRecordingStarted() {
        runOnUiThread {
            btnStartStop.text = "Stop screen recording"
            Toast.makeText(this, "Screen recording started", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onRecordingStopped(filePath: String?) {
        runOnUiThread {
            ScreenRecordingService.recordingCallback = null
            btnStartStop.text = "Start screen recording"

            if (filePath != null) {
                lastRecordingPath = filePath
                lastRecordingLabel = "Last screen recording"
                cardLastRecording.visibility = View.VISIBLE
                tvLastRecordingTitle.text = lastRecordingLabel
                tvLastRecordingSubtitle.text = "Tap to play recording"
                Toast.makeText(this, "Screen recording saved", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(
                    this,
                    "Screen recording stopped, but no file was saved.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    override fun onRecordingError(error: String) {
        runOnUiThread {
            ScreenRecordingService.recordingCallback = null
            btnStartStop.text = "Start screen recording"
            Toast.makeText(this, "Screen recording error: $error", Toast.LENGTH_LONG).show()
        }
    }

    // endregion

    // region Playback for last recording

    private fun togglePlaybackOfLastRecording() {
        val path = lastRecordingPath
        if (path.isNullOrEmpty()) {
            Toast.makeText(this, "No recording found", Toast.LENGTH_SHORT).show()
            return
        }

        if (lastRecordingLabel == "Last screen recording") {
            openScreenRecording(path)
            return
        }

        // AUDIO playback
        if (!isPlayingRecording) {
            try {
                stopPlaybackInternal()
                playbackPlayer = MediaPlayer().apply {
                    setDataSource(path)
                    setOnCompletionListener {
                        stopPlaybackInternal()
                    }
                    setOnPreparedListener {
                        start()
                    }
                    setOnErrorListener { _, _, _ ->
                        stopPlaybackInternal()
                        true
                    }
                    prepare()
                }
                isPlayingRecording = true
                btnPlayLastRecording.setImageResource(android.R.drawable.ic_media_pause)
                tvLastRecordingSubtitle.text =
                    formatDurationLabel(lastRecordingDurationSec, playing = true)
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(this, "Error playing audio: ${e.message}", Toast.LENGTH_SHORT)
                    .show()
                stopPlaybackInternal()
            }
        } else {
            stopPlaybackInternal()
        }
    }

    // NEW: show screen recording inside a modal dialog with VideoView
    private fun openScreenRecording(path: String) {
        try {
            val file = File(path)
            if (!file.exists()) {
                Toast.makeText(this, "Recording file not found", Toast.LENGTH_SHORT).show()
                return
            }

            val uri = FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                file
            )

            val videoView = VideoView(this).apply {
                setVideoURI(uri)
                setOnPreparedListener { mp ->
                    mp.isLooping = true
                    start()
                }
                setOnErrorListener { _, what, extra ->
                    Toast.makeText(
                        context,
                        "Error playing video ($what, $extra)",
                        Toast.LENGTH_SHORT
                    ).show()
                    stopPlayback()
                    true
                }
            }

            val dialog = AlertDialog.Builder(this)
                .setView(videoView)
                .setCancelable(true)
                .setPositiveButton("Close") { d, _ ->
                    videoView.stopPlayback()
                    d.dismiss()
                }
                .create()

            dialog.setOnShowListener {
                videoView.start()
            }

            dialog.setOnDismissListener {
                videoView.stopPlayback()
            }

            dialog.show()

        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(
                this,
                "Error opening recording: ${e.message}",
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private fun stopPlaybackInternal() {
        try {
            playbackPlayer?.stop()
        } catch (_: Exception) {
        }
        playbackPlayer?.release()
        playbackPlayer = null

        if (isPlayingRecording) {
            isPlayingRecording = false
            btnPlayLastRecording.setImageResource(android.R.drawable.ic_media_play)
            if (lastRecordingLabel != "Last screen recording") {
                tvLastRecordingSubtitle.text =
                    formatDurationLabel(lastRecordingDurationSec, playing = false)
            }
        }
    }

    private fun formatDurationLabel(seconds: Int, playing: Boolean): String {
        val mins = seconds / 60
        val secs = seconds % 60
        val base = String.format("%02d:%02d", mins, secs)
        return if (playing) "$base • Playing…" else "$base • Tap to play"
    }

    // endregion

    // region Report dialog

    private fun showReportDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_report_session, null)

        val etTitle = dialogView.findViewById<EditText>(R.id.etReportTitle)
        val etName = dialogView.findViewById<EditText>(R.id.etReportName)
        val etPhone = dialogView.findViewById<EditText>(R.id.etReportPhone)
        val etDetails = dialogView.findViewById<EditText>(R.id.etReportDetails)
        val cbMarkSuspicious = dialogView.findViewById<CheckBox>(R.id.cbMarkSuspicious)
        val btnCancel = dialogView.findViewById<MaterialButton>(R.id.btnCancelReport)
        val btnSubmit = dialogView.findViewById<MaterialButton>(R.id.btnSubmitReport)

        val alertDialog = AlertDialog.Builder(this)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        btnCancel.setOnClickListener {
            alertDialog.dismiss()
        }

        btnSubmit.setOnClickListener {
            val title = etTitle.text.toString().trim()
            val name = etName.text.toString().trim()
            val phone = etPhone.text.toString().trim()
            val details = etDetails.text.toString().trim()
            val markSuspicious = cbMarkSuspicious.isChecked

            if (title.isEmpty() && details.isEmpty()) {
                Toast.makeText(this, "Please add a subject or some details", Toast.LENGTH_SHORT)
                    .show()
                return@setOnClickListener
            }

            // TODO: send to backend
            Toast.makeText(this, "Thanks, your report has been captured.", Toast.LENGTH_SHORT)
                .show()
            alertDialog.dismiss()
        }

        alertDialog.show()
    }

    // endregion

    // region Helpers & lifecycle

    private fun getDisplayNameFromUri(uri: Uri): String? {
        return contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIndex != -1 && cursor.moveToFirst()) {
                cursor.getString(nameIndex)
            } else null
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (isListening) {
            stopAudioMonitoring()
        }
        stopPlaybackInternal()

        if (ScreenRecordingService.recordingCallback === this) {
            ScreenRecordingService.recordingCallback = null
        }
    }

    enum class SessionMode {
        LISTEN_AUDIO,
        UPLOAD_MEDIA,
        WEBSITE_LINK,
        SCREEN_RECORD
    }

    // endregion
}