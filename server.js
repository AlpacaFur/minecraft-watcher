const { Client, MessageEmbed } = require("discord.js")
const fs = require('fs');
const minecraftPing = require("minecraft-server-util");

const client = new Client();

var config;
var getMessage;
var avatarURL;
var previousStatus = {"online":null, "version":null, players: null};
var lastStatusUpdate;

// Load config into memory or exit
if (fs.existsSync("./config.json")) {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
}
else {
  fatalError("No config file found, exiting!")
}

function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2), 'utf8')
}

// Closes program if there is an unrecoverable error
function fatalError(string) {
  console.log()
  console.warn("\x1b[31m"+ string +"\x1b[0m")
  console.log()
  process.exit()
}

function createGetMessage(channelId, messageId) {
  return async function() {
    // Get message
    let channel = await client.channels.fetch(channelId);
    let message = await channel.messages.fetch(messageId);
    return message;
  }
}

function pingServer(serverAddress, serverPort) {
  return new Promise((resolve, reject)=>{
    minecraftPing(serverAddress, serverPort, (error, data)=>{
      resolve({error:error, data:data});
    })
  })
}

function objectIsSame(object1, object2, properties) {
  return properties.every(property => object1[property] === object2[property])
}

function setStatus({error, data}) {
  let status = {}
  if (!error && data) {
    status = {online: true, players: (data.samplePlayers || []).length, version: data.version}
  }
  else {
    status = {online: false, players: 0, version: false}
  }
  let timeSinceLastUpdate = (new Date()).getTime() - lastStatusUpdate;
  if (objectIsSame(status, previousStatus, ["online", "players", "version"]) &&
      timeSinceLastUpdate < 12*60*60*1000 /* 12 hours */) return;
  previousStatus = status;
  lastStatusUpdate = new Date().getTime()
  if (status.online) {
    if (status.version === null) {
      client.user.setPresence({ activity: {name: `Server starting up...`}, status: "idle" })
    }
    else {
      client.user.setPresence({ activity: {name: `${status.players} players (${status.version})`}, status: "online"})
    }
  }
  else {
    let now = new Date();
    previousStatus.timeOffline = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`
    client.user.setPresence({ activity: {name: `Offline! (at ${previousStatus.timeOffline})`}, status: "dnd"})
  }
}

function startPolling() {
  checkStatusAndUpdate()
  setInterval(checkStatusAndUpdate, 2000)
}

function checkStatusAndUpdate() {
  pingServer(config.serverAddress, config.serverPort)
    .then((info)=>{
      setStatus(info)
      getMessage()
        .then(msg=>msg.edit(createStatusEmbed(info)))
    })
}

function createStatusEmbed({data, error}) {
  let embed = new MessageEmbed()
    .setAuthor(config.displayAddress || config.serverAddress, avatarURL)
    .setFooter("Last Updated:")
    .setTimestamp((new Date()).getTime())
  if (!error && data) {
    if (data.version === null) {
      embed.setDescription(`Server starting up...`)
      embed.setColor("#F5AC3A")
    }
    else {
      let samplePlayers = data.samplePlayers || [];
      embed.setDescription(`Online - Running **${data.version}**! \n\n` +
      `**Players (${samplePlayers.length}):** \n` +
      samplePlayers.map(obj=>obj.name).join("\n") +
      (samplePlayers.length === 0 ? "*Nobody is on :(*" : ""))
      embed.setColor("GREEN")
    }
  }
  else {
    embed.setDescription(`Server Offline! Last online: ${previousStatus.timeOffline}`) // Add last online info later
    embed.setColor("RED")
  }
  return embed;
}

// Cleanly log out when exiting bot
process.on('SIGINT', ()=>{
  console.log("Client being put to bed...")
  try {
    let embed = new MessageEmbed()
      .setDescription("Bot Offline!")
      .setAuthor(config.displayAddress || config.serverAddress, avatarURL)
      .setFooter("Offline at:")
      .setTimestamp((new Date()).getTime())
    getMessage()
      .then((msg)=>{
        return msg.edit(embed)
      })
      .then(()=>{
        client.destroy();
        process.exit();
      })
  }
  catch {
    console.log("Couldn't edit message!")
    console.log("Client being put to bed...")
    client.destroy()
    process.exit()
  }
})

// Startup events
client.on('ready', ()=>{
  console.log("Bot Online!")
  avatarURL = client.user.avatarURL()
  if (config.statusMessageIds) {
    getMessage = createGetMessage(config.statusMessageIds[0], config.statusMessageIds[1])
    // Ignore messages sent to the bot
    let embed = new MessageEmbed()
      .setDescription("Please wait...")
    getMessage()
      .then(message=>message.edit(embed))
    startPolling()
  }
  else {
    // Listen for initial message
    let messageListener = client.on('message', (msg)=>{
      // On getting the correct placement message
      if (msg.content === config.prefix + "placemessage") {
        // Create a placeholder embed
        let embed = new MessageEmbed()
          .setDescription("Please wait...")
        // Send it
        msg.channel.send(embed)
          .then((message)=>{
            // After sending it, store the message and channel ids
            config.statusMessageIds = [message.channel.id, message.id];
            saveConfig();
            getMessage = createGetMessage(message.channel.id, message.id)
            // Start polling
            startPolling()
          })
      }
    })
  }
})

client.login(config.token)
  .catch(()=>{
    fatalError("[ERROR]: Login error, check your token.")
  })
