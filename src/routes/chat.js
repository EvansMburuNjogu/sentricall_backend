const express = require('express');
const authenticateJWT = require('../middleware/jwt');
const create_chat = require('../handlers/chat/create_chat');
const delete_chat = require('../handlers/chat/delete_chat');
const get_chats = require('../handlers/chat/get_chats');
const get_chat = require('../handlers/chat/get_chat');
const get_chat_conversations = require('../handlers/chat/get_chat_conversations');
const router = express();

router.use(authenticateJWT)

router.post('/create_chat',create_chat)
router.delete('/delete_chat/:chatId',delete_chat)
router.get('/get_chats',get_chats)
router.get('/get_chat/:chatId',get_chat)
router.get('/get_chat_conversations/:chatId',get_chat_conversations)

module.exports = router;