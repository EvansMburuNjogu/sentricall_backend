// handlers/session/create_session.js
const Session = require('../../models/session')

const create_session = async (req, res) => {
  try {
    const { name, type } = req.body
    const userId = req.user.userId

    const data = new Session({
      name,
      type,
      userId,
    })

    await data.save()

   res.status(200).json({
      message: 'Session created successfully.',
      session: data,
    })
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Error creating session', error: err.message })
  }
}

module.exports = create_session