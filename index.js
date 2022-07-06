var orbitapi = require('./lib/orbitapi.js')
var timer = require('./lib/countdown.js')
const schedule = require('node-schedule');
const axios = require('axios');



/*
Le Function
1. Get sunrise and temp data
2. Use sunrise to set water time 30 mins before.
3. Use heat to determine how long to water for.
*/


//server requirements
const express = require('express');
const app = express();
const port = 3000;

// Weather & Data vars
let weatherUrl = `https://api.openweathermap.org/data/2.5/onecall?lat=${process.env.LAT}&lon=${process.env.LON}&exclude=minutely,hourly&appid=${process.env.APIKEY}&units=imperial`

let currentData = {
  trigger: 'auto',
  dayTemp: '',
  daySunrise: '',
  waterStartTime: '',
  minutesWatered: '',
  grasshealth: 0,
  time: '',
}

let liveData = {
  active: false,
  zone: 0,
  waterTime: 0,
  timeStamp: 0,
}

console.log(`-----ORBI ONLINE-----\n-----Power Up @ ${new Date().toLocaleString()}-----`)

// app.get('/history', (req, res) => {
//   readFile('data.json', (error, data) => {
//     if (error) {
//       console.log('Error reading historical data: ', error);
//     }
//     let parsedData = JSON.parse(data);
//     console.log(`${new Date().toLocaleString()} Serving ${parsedData.length} historical records.`)
//     res.json(parsedData);
//   })
// })

// Endpoint for live watering data.
// Endpoint stopping watering.
app.get('/', (req, res) => {
  console.log('Serve Live Data')
  res.json(liveData);
})

// Endpoint for manually starting watering.
app.get('/manual', (req, res) => {
    let rt = req.query.time;
    getWeatherManual(rt);
    console.log('manual water triggered')
    res.send('Manually starting for ' + rt + ' mins.');  
})

// Endpoint stopping watering.
app.get('/stop', (req, res) => {
  stopWater();
  res.send('Stopping all zone watering.');
})

// Endpoint for grass health **** UNDER CONST ****
// app.get('/grasshealth', (req, res) => {
//   var options = {
//     mode: 'text',
//   };

//   PythonShell.run('grass-health/grass-health.py', options, async function (err, results) {
//     if (err) throw err;
//     let rt = await results;
//     res.send('Grass Health Results: ' + rt + '%')
//   });

// })


// ///////// CRON SETUP
// const regCron = '*/1 * * * *';
const regCron = '15 4 * * *';
const ghCron = '00 12 * * *';

const waterJob = schedule.scheduleJob(regCron, function () {
  console.log('-----ORBI POWER UP-----')
  getWeather();
})

//const grassHealthJob = schedule.scheduleJob(ghCron, function () {
  //console.log('-----AUTO GRASS HEALTH-----');
  //grassHealth();
//})

function getWeather() {
  axios.get(weatherUrl)
    .then(res => {
      let weather = res.data;
      // Sunrise and water time.
      let todaySunrise = weather.daily[0].sunrise;
      let sunrise = new Date(0)
      sunrise.setUTCSeconds(todaySunrise);
      let darkestBeforeDawn = new Date(sunrise - 1800000);
      let dbdHour = darkestBeforeDawn.getHours();
      let dbdMinute = darkestBeforeDawn.getMinutes();
      let cronTime = dbdMinute + ' ' + dbdHour + ' * * *'

      // Todays temp
      let todayTemp = weather.daily[0].temp.day;
      let waterDuration;
      if (todayTemp >= 100) {
        waterDuration = 30;
      } else if (todayTemp >= 90) {
        waterDuration = 25;
      } else if (todayTemp >= 85) {
        waterDuration = 22;
      } else if (todayTemp >= 80) {
        waterDuration = 19;
      } else {
        waterDuration = 15;
      }

      console.log(`\n\nOrbi v1.0\n---------------\nSunrise: ${sunrise.getHours() + ':' + (sunrise.getMinutes() < 10 ? '0' : '') + sunrise.getMinutes()
        }\nTodays High Temp: ${todayTemp}\n---------------\nWater at: ${darkestBeforeDawn.toLocaleTimeString()}\nDuration: ${waterDuration / 60} mins`)

      // Save data to JSON DB for historical records/ API endpoint
      currentData.trigger = 'auto';
      currentData.dayTemp = todayTemp;
      currentData.daySunrise = sunrise.getHours() + ':' + (sunrise.getMinutes() < 10 ? '0' : '') + sunrise.getMinutes();
      currentData.waterStartTime = darkestBeforeDawn.toLocaleString();
      currentData.minutesWatered = waterDuration;
      //saveToJson();
      // let cronNow = '051 11 * * *'
      // Set Cron Job for watering, with water duration.
      const job = schedule.scheduleJob(cronTime, function () {
        console.log('Starting Water Process.')
        water(waterDuration)
      })

    })
}

// Manual weather
function getWeatherManual(runTime) {
      water(runTime);
}



// Grass Health
function grassHealth() {
  console.log('RUN GH')
  let options = {
    mode: 'text',
  };
  let healthValue;

  PythonShell.run('grass-health/grass-health.py', options, async function (err, results) {
    if (err) throw err;
    let rt = await results;
    healthValue = parseFloat(rt[0], 2);
    console.log(healthValue);
    currentData.grasshealth = healthValue;
  });
}


// Make it drip
var log = {
  debug: function (l) { }
}
async function water(runTime) {
  try {
    let O = await new orbitapi(log, process.env.EMAIL, process.env.PASS)
    await O.getToken()
    var devices = await O.getDevices()

    // Run through all 5 zones for runTime
    for (let i = 1; i < 6; i++) {
      console.log("Running Zone", i)
      // Live data.
      liveData.active = true;
      liveData.zone = i;
      liveData.waterTime = runTime;
      liveData.timeStamp = new Date().toLocaleString();
      // Less water for the tree zone.
            
        await devices[0].startZone(i, runTime)
        await timer(runTime * 60);

      
      liveData.active = false;
      liveData.zone = 0;
      liveData.waterTime = 0;
      liveData.timeStamp = 0;

      console.log('Stopping Zone', i)
      await devices[0].stopZone()
      await timer(15);
    }
    console.log('All zones watered -- awaiting next cycle.')
  } catch (e) {
    console.log('error', e)
  }

}

// Make it not drip
async function stopWater() {
  try {
    let O = await new orbitapi(log, process.env.EMAIL, process.env.PASS)
    await O.getToken()
    var devices = await O.getDevices()

    // Run through all 5 zones for runTime
    for (let i = 1; i < 6; i++) {
      console.log('Stopping Zone', i)
      await devices[0].stopZone()
    }

  } catch (e) {
    console.log('error', e)
  }

}


// Read and write data to JSON.
function saveToJson() {

  readFile('data.json', (error, data) => {
    if (error) {
      console.error('An error: ', error)
      return;
    }
    console.log('Historical Data read successfully.');
    const parsedData = JSON.parse(data);
    writeFile('data.json', JSON.stringify([...parsedData, currentData]), (error) => {
      if (error) {
        console.error('An error: ', error);
        return;
      }
      console.log('Historical Data written successfully.');
    });
  })
}



// Express Server start.
app.listen(port, () => {
  console.log(`Server up on ${port} `)
})
