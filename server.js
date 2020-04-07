const { Client, MessageEmbed } = require("discord.js");
const fs = require("fs")
const minecraftPing = require("minecraft-server-util")


var avatarURL;
var config;
var statusMessage;

var previousStatus = {"online":false, "version":"00w00a", players: 0};

const client = new Client()

if (fs.existsSync("./config.json")) {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
}
else {
  fatalError("No config file found, exiting!")
}
if (!config.token) {
  fatalError("No token provided!")
}
if (!config.serverAddress) {
  fatalError("No server address provided!")
}

function fatalError(string) {
  console.log()
  console.warn("\x1b[31m"+ string +"\x1b[0m")
  console.log()
  process.exit()
}

function saveConfig() {
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2), 'utf8')
}

function updateStatusIfNecessary(status) {
  if (status.online === previousStatus.online &&
      status.players === previousStatus.players &&
      status.version === previousStatus.version) return;
  previousStatus = status;
  if (status.online) {
    if (status.version == null) {
      client.user.setPresence({ activity: {name: `Server starting up...`}, status: "idle" })
    }
    else {
      client.user.setPresence({ activity: {name: `${status.players} players (${status.version})`}, status: "online" })
    }
  }
  else {
    let now = new Date()
    previousStatus.timeOffline = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    client.user.setPresence({ activity: {name: `Offline! (at ${previousStatus.timeOffline})`}, status: "dnd" })
  }
}

function dataToEmbed(error, data) {
  let embed = new MessageEmbed()
    .setAuthor(config.displayAddress || config.serverAddress, avatarURL)
    .setFooter("Last Updated:")
    .setTimestamp((new Date()).getTime())
  if (!error && data) {
    let samplePlayers = data.samplePlayers || [];
    embed.setDescription(`Online - Running **${data.version}** \n\n` +
                         `**Players (${samplePlayers.length}):** \n ` +
                         samplePlayers.map(obj=>obj.name).join("\n") +
                         (samplePlayers.length === 0 ? "*Nobody is on :(*": ""))
    embed.setColor("GREEN")
  }
  else {
    embed.setDescription("Server Offline!")
    embed.setColor("RED")
  }
  return embed;
}

function startPolling() {
  setInterval(()=>{
    minecraftPing(config.serverAddress, config.serverPort, (error, data)=>{
      statusMessage.edit(dataToEmbed(error, data))
      if (!error && data) {
        updateStatusIfNecessary({online: true, players: (data.samplePlayers || []).length, version: data.version})
      }
      else {
        updateStatusIfNecessary({online:false, players: 0, version: false})
      }
    })
  }, 2000)
}

function selectMessageAndStartPolling(messageId, channelId) {
  client.channels.fetch(channelId)
    .then((channel)=>{
      channel.messages.fetch(messageId)
        .then((message)=>{
          statusMessage = message;
          startPolling();
        })
    })
}


if (!config.statusMessageIds) {
  client.on('message', (msg)=>{
    if (config.statusMessageIds) return;
    if (msg.content === config.prefix + "placemessage") {
      let embed = new MessageEmbed();
        embed.setDescription("Please wait...")
      msg.channel.send(embed)
        .then((message)=>{
          config.statusMessageIds = [message.id, message.channel.id];
          saveConfig();
          selectMessageAndStartPolling(config.statusMessageIds[0],config.statusMessageIds[1]);
        })
    }
  })
}

client.on('ready', ()=>{
  console.log("Bot online!");
  avatarURL = client.user.avatarURL()
  client.user.setPresence({ activity: {name: 'Loading...'}, status: "idle" })

  if (config.statusMessageIds) {
    selectMessageAndStartPolling(config.statusMessageIds[0],config.statusMessageIds[1]);
  }
})

process.on('SIGINT', function() {
    console.log("Destroying Client...");
    client.destroy();
    process.exit();
});

client.login(config.token)
  .catch(err=>{
    console.error(err);
    fatalError("\x1b[31m[ERROR]: Login error, terminating process. Check your token\x1b[0m")
  })
