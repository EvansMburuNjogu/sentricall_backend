package com.ke.sentricall

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class CopilotFragment : Fragment(R.layout.fragment_copilot) {

    // All views nullable to avoid crashes if not found
    private var btnNewChat: MaterialButton? = null
    private var containerChats: LinearLayout? = null
    private var containerSessions: LinearLayout? = null
    private var itemChatSample: View? = null
    private var itemSessionSample: View? = null
    private var progressLoading: ProgressBar? = null

    companion object {
        private const val TAG = "CopilotFragment"
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        Log.d(TAG, "onViewCreated")

        // Bind views safely
        btnNewChat = view.findViewById(R.id.btnNewChat)
        containerChats = view.findViewById(R.id.containerChats)
        containerSessions = view.findViewById(R.id.containerSessions)
        itemChatSample = view.findViewById(R.id.itemChatSample)
        itemSessionSample = view.findViewById(R.id.itemSessionSample)
        progressLoading = view.findViewById(R.id.progressLoading)

        // Hide sample items – we render real data
        itemChatSample?.visibility = View.GONE
        itemSessionSample?.visibility = View.GONE

        // New AI chat → open custom dialog
        btnNewChat?.setOnClickListener {
            if (!isOnline()) {
                Toast.makeText(requireContext(), "No internet connection", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            showNewChatDialog()
        }

        // Placeholder for sessions – to be wired later
        itemSessionSample?.setOnClickListener {
            Toast.makeText(requireContext(), "Session details coming soon", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "onResume → loadCopilotData()")
        // Every time you switch to Copilot tab, reload chats
        loadCopilotData()
    }

    // --------------------------------------------------
    // HIGH LEVEL LOAD
    // --------------------------------------------------

    private fun loadCopilotData() {
        if (!isAdded) {
            Log.w(TAG, "loadCopilotData called but fragment is not added")
            return
        }

        if (!isOnline()) {
            Toast.makeText(
                requireContext(),
                "You are offline. Connect to the internet to load Copilot.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        showLoading(true)
        fetchChats()
        // Later: fetchSessions() when you have a sessions API
    }

    // --------------------------------------------------
    // FETCH CHATS: GET /api/v1/chats/get_chats
    // --------------------------------------------------

    private fun fetchChats() {
        val ctx = context ?: return

        Log.d(TAG, "Fetching chats from backend")

        val prefs = ctx.getSharedPreferences("sentricall_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", null)

        if (token.isNullOrEmpty()) {
            Log.w(TAG, "No auth token found in prefs")
            showLoading(false)
            Toast.makeText(ctx, "Session expired. Please log in again.", Toast.LENGTH_LONG).show()
            navigateToLogin()
            return
        }

        Thread {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(AppConfig.BASE_URL + "chats/get_chats")
                Log.d(TAG, "GET URL: $url")

                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    setRequestProperty("Authorization", "Bearer $token")
                    connectTimeout = 10000
                    readTimeout = 10000
                }

                val status = connection.responseCode
                val responseBody = if (status in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                }

                Log.d(TAG, "GET /get_chats status=$status body=$responseBody")

                activity?.runOnUiThread {
                    showLoading(false)

                    if (status in 200..299) {
                        renderChats(responseBody)
                    } else {
                        if (status == 401 || status == 403) {
                            forceLogout("Session expired. Please log in again.")
                            return@runOnUiThread
                        }
                        Toast.makeText(
                            ctx,
                            "Error loading chats ($status)",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error fetching chats", e)
                activity?.runOnUiThread {
                    showLoading(false)
                    Toast.makeText(
                        ctx,
                        "Network error loading chats: ${e.localizedMessage ?: "check your connection"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    private fun renderChats(responseBody: String) {
        val ctx = context ?: return
        val chatsContainer = containerChats ?: return

        Log.d(TAG, "Rendering chats UI")

        chatsContainer.removeAllViews()

        try {
            val root = JSONObject(responseBody)
            val chatsArray: JSONArray = root.optJSONArray("chats") ?: JSONArray()

            if (chatsArray.length() == 0) {
                val emptyView = TextView(ctx).apply {
                    text = "No AI chats yet. Start your first investigation above."
                    setTextColor(ContextCompat.getColor(ctx, R.color.guard_subtle))
                    textSize = 13f
                }
                chatsContainer.addView(emptyView)
                return
            }

            for (i in 0 until chatsArray.length()) {
                val obj = chatsArray.optJSONObject(i) ?: continue
                val chatId = obj.optString("_id", "")
                val name = obj.optString("name", "").ifBlank { "Untitled chat" }

                if (chatId.isBlank()) continue

                val item = buildChatItemView(chatId, name)
                chatsContainer.addView(item)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing chats JSON", e)
            Toast.makeText(ctx, "Error parsing chats", Toast.LENGTH_LONG).show()
        }
    }

    // --------------------------------------------------
    // NEW CHAT: custom dialog + POST /create_chat
    // --------------------------------------------------

    private fun showNewChatDialog() {
        if (!isAdded) return
        val ctx = requireContext()
        val inflater = layoutInflater

        // Uses dialog_new_chat.xml
        val dialogView = inflater.inflate(R.layout.dialog_new_chat, null)

        val tilChatName = dialogView.findViewById<TextInputLayout>(R.id.tilChatName)
        val etChatName = dialogView.findViewById<TextInputEditText>(R.id.etChatName)
        val btnCancel = dialogView.findViewById<Button>(R.id.btnCancel)
        val btnCreate = dialogView.findViewById<Button>(R.id.btnCreate)

        val dialog = AlertDialog.Builder(ctx)
            .setView(dialogView)
            .setCancelable(true)
            .create()

        btnCancel.setOnClickListener {
            dialog.dismiss()
        }

        btnCreate.setOnClickListener {
            val name = etChatName.text?.toString()?.trim().orEmpty()
            if (name.isEmpty()) {
                tilChatName.error = "Chat name is required"
            } else {
                tilChatName.error = null
                dialog.dismiss()
                createChat(name)
            }
        }

        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()
    }

    private fun createChat(name: String) {
        val ctx = context ?: return

        if (!isOnline()) {
            Toast.makeText(ctx, "No internet connection", Toast.LENGTH_SHORT).show()
            return
        }

        val prefs = ctx.getSharedPreferences("sentricall_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", null)

        if (token.isNullOrEmpty()) {
            Toast.makeText(ctx, "Session expired. Please log in again.", Toast.LENGTH_LONG).show()
            navigateToLogin()
            return
        }

        showLoading(true)

        Thread {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(AppConfig.BASE_URL + "chats/create_chat")
                Log.d(TAG, "POST URL: $url")

                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer $token")
                    doOutput = true
                    connectTimeout = 10000
                    readTimeout = 10000
                }

                val payload = JSONObject().apply {
                    put("name", name)
                }

                connection.outputStream.use { os ->
                    val bytes = payload.toString().toByteArray(Charsets.UTF_8)
                    os.write(bytes, 0, bytes.size)
                }

                val status = connection.responseCode
                val responseBody = if (status in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                }

                Log.d(TAG, "POST /create_chat status=$status body=$responseBody")

                activity?.runOnUiThread {
                    showLoading(false)

                    if (status in 200..299) {
                        try {
                            val root = JSONObject(responseBody)
                            val chatObj = root.optJSONObject("chat")

                            // Safely derive chatId and chatName
                            val chatId = chatObj?.optString("_id", "") ?: ""
                            val rawName = chatObj?.optString("name", name)
                            val chatName = if (rawName.isNullOrBlank()) name else rawName

                            if (chatId.isNotBlank()) {
                                // ✅ Go straight to ChatActivity
                                val intent = Intent(ctx, ChatActivity::class.java).apply {
                                    putExtra("chat_id", chatId)
                                    putExtra("chat_name", chatName)
                                }
                                startActivity(intent)
                            } else {
                                // Fallback: just show success & refresh list
                                Toast.makeText(ctx, "Chat created successfully", Toast.LENGTH_SHORT).show()
                                loadCopilotData()
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error parsing create_chat response", e)
                            Toast.makeText(ctx, "Chat created. Reloading list…", Toast.LENGTH_SHORT).show()
                            loadCopilotData()
                        }
                    } else {
                        if (status == 401 || status == 403) {
                            forceLogout("Session expired. Please log in again.")
                            return@runOnUiThread
                        }
                        val msg = try {
                            JSONObject(responseBody).optString("message", "Error creating chat")
                        } catch (_: Exception) {
                            "Error creating chat ($status)"
                        }
                        Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error creating chat", e)
                activity?.runOnUiThread {
                    showLoading(false)
                    Toast.makeText(
                        ctx,
                        "Network error creating chat: ${e.localizedMessage ?: "check your connection"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    // --------------------------------------------------
    // DELETE CHAT: DELETE /api/v1/chats/delete_chat/:chatId
    // --------------------------------------------------

    private fun confirmDeleteChat(chatId: String, viewToRemove: View) {
        if (!isAdded) return
        val ctx = requireContext()
        AlertDialog.Builder(ctx)
            .setTitle("Delete chat")
            .setMessage("Are you sure you want to delete this chat?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                deleteChat(chatId, viewToRemove)
            }
            .show()
    }

    private fun deleteChat(chatId: String, viewToRemove: View) {
        val ctx = context ?: return

        if (!isOnline()) {
            Toast.makeText(ctx, "No internet connection", Toast.LENGTH_SHORT).show()
            return
        }

        val prefs = ctx.getSharedPreferences("sentricall_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_token", null)

        if (token.isNullOrEmpty()) {
            Toast.makeText(ctx, "Session expired. Please log in again.", Toast.LENGTH_LONG).show()
            navigateToLogin()
            return
        }

        showLoading(true)

        Thread {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(AppConfig.BASE_URL + "chats/delete_chat/$chatId")
                Log.d(TAG, "DELETE URL: $url")

                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "DELETE"
                    setRequestProperty("Authorization", "Bearer $token")
                    connectTimeout = 10000
                    readTimeout = 10000
                }

                val status = connection.responseCode
                val responseBody = if (status in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                }

                Log.d(TAG, "DELETE /delete_chat status=$status body=$responseBody")

                activity?.runOnUiThread {
                    showLoading(false)

                    val chatsContainer = containerChats ?: return@runOnUiThread

                    if (status in 200..299) {
                        chatsContainer.removeView(viewToRemove)
                        Toast.makeText(ctx, "Chat deleted", Toast.LENGTH_SHORT).show()

                        if (chatsContainer.childCount == 0) {
                            val emptyView = TextView(ctx).apply {
                                text = "No AI chats yet. Start your first investigation above."
                                setTextColor(ContextCompat.getColor(ctx, R.color.guard_subtle))
                                textSize = 13f
                            }
                            chatsContainer.addView(emptyView)
                        }
                    } else {
                        if (status == 401 || status == 403) {
                            forceLogout("Session expired. Please log in again.")
                            return@runOnUiThread
                        }
                        val msg = try {
                            JSONObject(responseBody).optString("message", "Error deleting chat")
                        } catch (_: Exception) {
                            "Error deleting chat ($status)"
                        }
                        Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error deleting chat", e)
                activity?.runOnUiThread {
                    showLoading(false)
                    Toast.makeText(
                        ctx,
                        "Network error deleting chat: ${e.localizedMessage ?: "check your connection"}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    // --------------------------------------------------
    // BUILD CHAT ITEM VIEW (matches your design)
    // --------------------------------------------------

    private fun buildChatItemView(chatId: String, name: String): View {
        val ctx = requireContext()

        val itemLayout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#111827"))
            isClickable = true
            isFocusable = true
            val lp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = dp(8)
            layoutParams = lp
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }

        val headerRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val tvTitle = TextView(ctx).apply {
            text = name
            setTextColor(ContextCompat.getColor(ctx, R.color.guard_text))
            textSize = 14f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
            )
        }

        val btnDelete = android.widget.ImageButton(ctx).apply {
            setImageResource(android.R.drawable.ic_menu_delete)
            background = null
            imageTintList = ContextCompat.getColorStateList(ctx, android.R.color.holo_red_light)
            val lp = LinearLayout.LayoutParams(dp(32), dp(32))
            layoutParams = lp
            contentDescription = "Delete chat"
        }

        headerRow.addView(tvTitle)
        headerRow.addView(btnDelete)

        val tvSubtitle = TextView(ctx).apply {
            text = "Tap to continue your AI investigation."
            setTextColor(ContextCompat.getColor(ctx, R.color.guard_subtle))
            textSize = 12f
            setPadding(0, dp(2), 0, 0)
        }

        itemLayout.addView(headerRow)
        itemLayout.addView(tvSubtitle)

        // Open ChatActivity with this chat
        itemLayout.setOnClickListener {
            if (!isOnline()) {
                Toast.makeText(ctx, "No internet connection", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val intent = Intent(ctx, ChatActivity::class.java).apply {
                putExtra("chat_id", chatId)
                putExtra("chat_name", name)
            }
            startActivity(intent)
        }

        btnDelete.setOnClickListener {
            if (!isOnline()) {
                Toast.makeText(ctx, "No internet connection", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            confirmDeleteChat(chatId, itemLayout)
        }

        return itemLayout
    }

    private fun dp(value: Int): Int {
        val metrics = resources.displayMetrics
        return (value * metrics.density).toInt()
    }

    // --------------------------------------------------
    // CONNECTIVITY + AUTH HELPERS
    // --------------------------------------------------

    private fun isOnline(): Boolean {
        val ctx = context ?: return false
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager?

        if (cm != null) {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    val nw = cm.activeNetwork ?: return false
                    val actNw = cm.getNetworkCapabilities(nw) ?: return false
                    actNw.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                } catch (e: SecurityException) {
                    Log.e(TAG, "Missing ACCESS_NETWORK_STATE permission", e)
                    false
                }
            } else {
                @Suppress("DEPRECATION")
                val nwInfo = cm.activeNetworkInfo ?: return false
                @Suppress("DEPRECATION")
                nwInfo.isConnected
            }
        }
        return false
    }

    private fun showLoading(show: Boolean) {
        progressLoading?.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun forceLogout(message: String? = null) {
        val ctx = context ?: return
        val prefs = ctx.getSharedPreferences("sentricall_prefs", Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
        if (!message.isNullOrEmpty()) {
            Toast.makeText(ctx, message, Toast.LENGTH_LONG).show()
        }
        navigateToLogin()
    }

    private fun navigateToLogin() {
        if (!isAdded) return
        val ctx = requireContext()
        val intent = Intent(ctx, LoginActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        startActivity(intent)
        activity?.finish()
    }
}