// ===============================
// Part 1/3 - server.js
// Amertak Mini Bot Upgrade
// ===============================

require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const http = require("http");

const User = require("./models/User");


// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

const TTS_API_URL =
process.env.TTS_API_URL ||
"https://khmer-tts-api.onrender.com/tts";


const AUDIO_DIR =
path.join(__dirname, "audio");


const BOT_USERNAME =
"amertak_bot";


const WEBSITE_URL =
"https://amertak.vercel.app";


const DEVELOPER_NAME =
"គីន ថាវរ៉ាត់";


const DEVELOPER_LINK =
"https://t.me/amertak_network";



// ─── Speed cycle ──────────────────────────────────────────────────────────────

const SPEED_CYCLE = [
0.5,
1.0,
1.5,
2.0
];



// ─── Voice label ──────────────────────────────────────────────────────────────

function getVoiceLabel(voice){

if(voice === "km-KH-PisethNeural")
return "Piseth (ប្រុស)";


if(voice === "km-KH-SreymomNeural")
return "Sreymom (ស្រី)";


return voice;

}



// ─── Keyboard ─────────────────────────────────────────────────────────────────

function buildInlineKeyboard(user){


const voiceLabel =
user.voice === "km-KH-PisethNeural"

?
"🎙 សំឡេងប្រុស ✅"

:
"🎙 សំឡេងប្រុស";



const voiceLabelF =
user.voice === "km-KH-SreymomNeural"

?
"🎙 សំឡេងស្រី ✅"

:
"🎙 សំឡេងស្រី";



return {


reply_markup:{


inline_keyboard:[


[

{
text:voiceLabel,
callback_data:"voice_male"
},


{
text:voiceLabelF,
callback_data:"voice_female"
}

],



[

{
text:`⚡ ល្បឿន: ${user.speed.toFixed(1)}x`,
callback_data:"speed_cycle"
},


{
text:"⚙️ Settings",
callback_data:"settings"
}

]


]


}


};


}



// ─── Create audio folder ──────────────────────────────────────────────────────

if(!fs.existsSync(AUDIO_DIR)){

fs.mkdirSync(
AUDIO_DIR,
{
recursive:true
}
);


console.log("📁 Audio folder created");

}



// ─── MongoDB ──────────────────────────────────────────────────────────────────

mongoose
.connect(MONGODB_URI)

.then(()=>{

console.log("✅ MongoDB connected");

})

.catch(err=>{

console.error(
"❌ MongoDB error:",
err.message
);


process.exit(1);

});



// ─── Bot Init ─────────────────────────────────────────────────────────────────

const bot =
new TelegramBot(
BOT_TOKEN,
{
polling:true
}
);


console.log(
"🤖 Amertak Mini Bot running..."
);




// ─── /start ───────────────────────────────────────────────────────────────────

bot.onText(
/\/start/,
async(msg)=>{


const chatId =
msg.chat.id;


const telegramId =
msg.from.id;


const firstName =
msg.from.first_name || "";


const username =
msg.from.username || "";



try{


let user =
await User.findOne({
telegramId
});



if(!user){


user =
await User.create({

telegramId,

firstName,

username,

voice:
"km-KH-PisethNeural",

speed:
1.0

});


console.log(
`👤 New user ${telegramId}`
);


}




const fullName =

`${msg.from.first_name || ""} ${msg.from.last_name || ""}`

.trim()

|| "User";



const userLink =

msg.from.username

?

`[${fullName}](https://t.me/${msg.from.username})`

:

fullName;




const welcomeText =


`សូមស្វាគមន៍ ${userLink} មកកាន់ [Amertak Mini Bot](https://t.me/${BOT_USERNAME}) 🤖


• មុខងារ:
- 🎙 បង្កើតសំឡេង Ai
- 🤖 Ai Chat - សួរអ្វីក៏បាន

• របៀបប្រើ:
1. ផ្ញើអក្សរទៅកាន់ bot ដើម្បីបង្កើតសំឡេង និងជ្រើសរើសប្រភេទសំឡេងប្រុស ឬស្រី និងល្បឿនសំឡេង

2. សរសេរ:
/ask សំណួរ

ដើម្បីសួរទៅ Ai


• ព័ត៌មានបន្ថែម:
🌐 វេបសាយ: [អមតៈ - Amertak](${WEBSITE_URL})
🥀 ម្ចាស់បូត: [Thavrath Amertak](${DEVELOPER_LINK})
`;




await bot.sendMessage(

chatId,

welcomeText,

{

parse_mode:"Markdown",

...buildInlineKeyboard(user)

}

);



}

catch(err){


console.error(
"❌ Start error:",
err.message
);



await bot.sendMessage(

chatId,

"❌ មានបញ្ហាក្នុងការចាប់ផ្តើម bot"

);


}



}

);



// ⬇️ Part 2 continues here:
// - /ask AI Groq
// - message handler
// - callback query


// ─── /ask command (AI Assistant) ─────────────────────────────────────────────

bot.onText(
/\/ask(?:\s+(.+))?/,
async(msg, match)=>{


const chatId = msg.chat.id;


const userQuestion =
match[1]?.trim();



if(!userQuestion){


return bot.sendMessage(

chatId,

"❓ សូមវាយសំណួរ បន្ទាប់ពី /ask\n\nឧទាហរណ៍:\n/ask របៀបប្រើ Amertak Mini Bot?"

);


}



try{


await bot.sendChatAction(

chatId,

"typing"

);




const response =

await axios.post(


"https://api.groq.com/openai/v1/chat/completions",


{


model:

"llama-3.3-70b-versatile",



temperature:

0.7,



messages:[


{

role:"system",


content:

`
អ្នកជា Amertak AI Assistant ក្នុង Amertak Mini Bot។

ព័ត៌មានអំពី Bot:

ឈ្មោះ:
Amertak Mini Bot

មុខងារ:
- បង្កើតសំឡេង AI Khmer TTS
- AI Chat សួរអ្វីក៏បាន

Website:
https://amertak.vercel.app
Link of website:
tools/text-to-speech-khmer (tts)
tools/downloader
tools/cloud
tools/qr-code
tools/transcribe


Developer:
គីន ថាវរ៉ាត់
Telegram:
https://t.me/amertak_network


របៀបឆ្លើយ:
- ឆ្លើយជាភាសាខ្មែរ ជាចម្បង
- ឆ្លើយឲ្យងាយយល់
- រៀបចំជាចំណុចនៅពេលចាំបាច់
- សម្រាប់ coding ផ្តល់ code និង explanation
- កុំបង្កើតព័ត៌មានមិនពិត
- មិនត្រូវឆ្លើយថាបង្កើតឡើងដោយក្រុមហ៑ុនទេ គឺបង្កើតដោយ developer តែម្នាក់ប៉ុណ្ណោះ បើ user សួរ
`

},



{

role:"user",

content:userQuestion

}



]


},



{


headers:{


"Authorization":

`Bearer ${GROQ_API_KEY}`,



"Content-Type":

"application/json"


},



timeout:

30000


}


);




const answer =

response.data
.choices[0]
.message
.content;




await bot.sendMessage(

chatId,

`🤖 Amertak AI:\n\n${answer}`

);



}


catch(err){


console.error(

"❌ AI Ask Error:",

err.message

);



await bot.sendMessage(

chatId,

"❌ AI មិនអាចឆ្លើយបានទេ សូមព្យាយាមម្តងទៀត។"

);


}



}

);





// ─── Normal Message Handler (TTS) ────────────────────────────────────────────


bot.on(
"message",
async(msg)=>{


if(!msg.text)
return;



if(msg.text.startsWith("/"))
return;



const chatId =
msg.chat.id;


const telegramId =
msg.from.id;


const text =
msg.text.trim();



try{


let user =

await User.findOne({
telegramId
});



if(!user){


user =
await User.create({

telegramId,

firstName:
msg.from.first_name || "",


username:
msg.from.username || "",


voice:
"km-KH-PisethNeural",


speed:
1.0


});


}



// text → TTS

await handleTTS(

bot,

chatId,

user,

text

);



}

catch(err){


console.error(

"❌ Message handler error:",

err.message

);



await bot.sendMessage(

chatId,

"❌ មានបញ្ហា សូមព្យាយាមម្តងទៀត។"

);



}



}

);





// ─── Callback Query Handler ──────────────────────────────────────────────────


bot.on(

"callback_query",

async(query)=>{


const chatId =
query.message.chat.id;


const telegramId =
query.from.id;


const data =
query.data;


const messageId =
query.message.message_id;



try{


let user =

await User.findOne({
telegramId
});



if(!user){


user =
await User.create({

telegramId,


firstName:
query.from.first_name || "",


username:
query.from.username || "",


voice:
"km-KH-PisethNeural",


speed:
1.0


});


}




// Voice Male

if(data === "voice_male"){


user.voice =
"km-KH-PisethNeural";


await user.save();



await bot.answerCallbackQuery(

query.id,

{

text:
"បានប្តូរទៅ Piseth ✅"

}

);



await bot.editMessageReplyMarkup(

buildInlineKeyboard(user).reply_markup,

{

chat_id:
chatId,


message_id:
messageId

}

);


return;

}





// Voice Female

if(data === "voice_female"){


user.voice =
"km-KH-SreymomNeural";


await user.save();



await bot.answerCallbackQuery(

query.id,

{

text:
"បានប្តូរទៅ Sreymom ✅"

}

);



await bot.editMessageReplyMarkup(

buildInlineKeyboard(user).reply_markup,

{

chat_id:
chatId,


message_id:
messageId

}

);



return;

}





// Speed

if(data === "speed_cycle"){



let currentIndex =

SPEED_CYCLE.indexOf(
user.speed
);



let nextIndex =

(currentIndex + 1)

%

SPEED_CYCLE.length;



user.speed =

SPEED_CYCLE[nextIndex];



await user.save();



await bot.answerCallbackQuery(

query.id,

{

text:
`⚡ Speed ${user.speed.toFixed(1)}x`

}

);



await bot.editMessageReplyMarkup(

buildInlineKeyboard(user).reply_markup,

{

chat_id:
chatId,


message_id:
messageId

}

);



return;

}





// Settings

if(data === "settings"){



const settingsText =


`⚙️ ការកំណត់


👤 ឈ្មោះ:
${user.firstName || "N/A"}


🎙 Voice:
${getVoiceLabel(user.voice)}


⚡ Speed:
${user.speed.toFixed(1)}x


🆔 ID:
\`${user.telegramId}\`
`;



await bot.answerCallbackQuery(
query.id
);



await bot.sendMessage(

chatId,

settingsText,

{

parse_mode:"Markdown",

...buildInlineKeyboard(user)

}

);



return;

}



await bot.answerCallbackQuery(
query.id
);



}

catch(err){


console.error(

"❌ Callback error:",

err.message

);



await bot.answerCallbackQuery(

query.id,

{

text:
"❌ Error"

}

);



}


}

);



// ⬇️ Part 3 continues here:
// - handleTTS()
// - polling error
// - HTTP server


// ─── TTS Handler ─────────────────────────────────────────────────────────────

async function handleTTS(
  bot,
  chatId,
  user,
  text
){

const tempFilePath =

path.join(

AUDIO_DIR,

`tts_${chatId}_${Date.now()}.mp3`

);



try{


// 1. Call TTS API

const response =

await axios.post(

TTS_API_URL,

{

text:text,

voice:user.voice

},

{

responseType:"arraybuffer",

timeout:30000

}

);




// 2. Save audio file

const audioBuffer =

Buffer.from(response.data);



fs.writeFileSync(

tempFilePath,

audioBuffer

);




// 3. Caption

const voiceName =

user.voice === "km-KH-PisethNeural"

?

"ᴘɪsᴇᴛʜ"

:

"sʀᴇʏᴍᴏᴍ";




const caption =


`♡ ᴠᴏɪᴄᴇ: ${voiceName}
⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ: @amertak_bot`;




// 4. Send audio

await bot.sendAudio(

chatId,

tempFilePath,

{


caption,


title:
"សំឡេង Ai ;)",



performer:

`បង្កើតដោយ: អមតៈ - Amertak · ${voiceName}`,



...buildInlineKeyboard(user)


}

);



console.log(

`🎵 Audio sent to ${chatId}`

);



}


catch(err){



console.error(

"❌ TTS Error:",

err.message

);



let errorMessage =

"❌ មានបញ្ហាក្នុងការបង្កើតសំឡេង។ សូមព្យាយាមម្តងទៀត។";




if(

err.code === "ECONNABORTED"

||

err.message.includes("timeout")

){

errorMessage =

"⏱ 𝚃𝚃𝚂 𝙰𝙿𝙸 𝚃𝙾𝙾𝙺 𝚃𝙾 𝙻𝙾𝙽𝙶 𝚃𝙾 𝚁𝙴𝚂𝙿𝙾𝙽𝙳។ សូមព្យាយាមម្តងទៀត។";


}



await bot.sendMessage(

chatId,

errorMessage

);



}


finally{


// Cleanup file

if(fs.existsSync(tempFilePath)){


fs.unlinkSync(tempFilePath);



console.log(

`🗑 Deleted ${path.basename(tempFilePath)}`

);



}


}


}






// ─── Polling Error ────────────────────────────────────────────────────────────

bot.on(

"polling_error",

(err)=>{


console.error(

"❌ Telegram polling error:",

err.message

);


}

);






// ─── Render HTTP Server ──────────────────────────────────────────────────────

const PORT =

process.env.PORT || 3000;



http.createServer(

(req,res)=>{


res.writeHead(

200,

{

"Content-Type":

"text/plain"

}

);



res.end(

"Amertak Mini Bot is running.\n"

);



}

)

.listen(

PORT,

()=>{


console.log(

`🌐 Server running on port ${PORT}`

);


}

);