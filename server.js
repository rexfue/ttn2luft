// Wait for http-Post requests, analyse the data and send it to luftdaten.info

// contants
const LUFTDATEN = "http://api.sensor.community/v1/push-sensor-data/"
const TOILET = "http://ptsv2.com/t/enbwck3/post"

const USEHOST = process.env.USEHOST || LUFTDATEN;
const debug = (process.env.DEBUG == "true");

const version = require ('./package.json').version;
const v_date = require ('./package.json').date;

const express = require('express'),
    app = express(),
    port = process.env.PORT || 3010,
    moment = require('moment'),
    axios = require('axios');

app.post('/', express.json({type:'application/json'}), (req,res) => {
    res.sendStatus(200);
    let sid = (req.headers['x-ssid'] != undefined) ?  req.headers['x-ssid'] : (req.headers['x-sid'] != undefined) ? req.headers['x-sid'] : "0";
    doParse(req.body, parseInt(sid)) ;
});

app.listen(port);

const now = moment().format("YYYY-MM-DD HH:mm");
console.log(`${now} -- ttn2luft (V_${version}, ${v_date}) server started on: ${port}`);

function doParse(body, sid) {
    let values;
    let tosend;
    let chipid = parseInt(body.hardware_serial.substr(-8),16);
    console.log(`Chip-ID: ${chipid}`);
    if(body.port == 1) {
        values = parsePayloadGeiger(Buffer.from(body.payload_raw, 'base64'));
        tosend = '{"sensordatavalues":['+
            '{"value_type":"counts_per_minute","value":"'+values.cpm+'"},'+
            '{"value_type":"counts","value":"'+values.count+'"},'+
            '{"value_type":"sample_time_ms","value":"'+values.sample_time+'"}'+
            '],'+
            '"software_version":"V_'+values.software_version+'"}';
        if (debug) {
            console.log(tosend);
        }
        sendTo(tosend,'19',chipid, sid);
    } else if (body.port == 2) {
        values = parsePayloadBME280(Buffer.from(body.payload_raw, 'base64'));
        tosend = '{"sensordatavalues":['+
            '{"value_type":"temperature","value":"'+values.temperature+'"},'+
            '{"value_type":"humidity","value":"'+values.humidity+'"},'+
            '{"value_type":"pressure","value":"'+values.pressure+'"}'+
            ']}';
        if (debug) {
            console.log(tosend);
        }
        sendTo(tosend,'11',chipid, sid);
    }
}

function parsePayloadGeiger(buff) {
    if(debug) {
        console.log(buff);
    }
    let ret = {};
    ret.count = (buff[0] << 24) + (buff[1] << 16) + (buff[2] << 8) + buff[3];
    ret.sample_time = (buff[4] << 16) + (buff[5] << 8) + buff[6];
    let ma =  (buff[7]>>4);
    let mi = ((buff[7]&0xF)*16)+(buff[8]>>4);
    let pa = buff[8]&0xF;
    ret.tube = buff[9];
    ret.software_version = ma + '.' + mi + '.' + pa;
    ret.cpm = ret.count * 60000 / ret.sample_time;
    if (debug) {
        console.log(ret);
    }
    return ret;
}

function parsePayloadBME280(buff) {
    if(debug) {
        console.log(buff);
    }
    let ret = {};
    // temperature has 0.1°
    ret.temperature = ((buff[0] << 8) + buff[1]) / 10 ;
    // humidity is in 0.5%
    ret.humidity = buff[2] / 2;
    // pressure is in 0.1 hPa, sensor.community expects Pa
    ret.pressure = ((buff[3] << 8) + buff[4]) * 10;
    if (debug) {
        console.log(ret);
    }
    return ret;
}

function sendTo(tosend, xpin, chipid, sid) {
    const id = "TTN-"+chipid;
    const options = {
        headers: {
            "Content-Type":"application/json; charset=UTF-8",
            "X-Sensor":id,
            "Connection":"close",
            "X-PIN":xpin
        }
    };
    axios.post(USEHOST,tosend,options)
        .then((res) => {
            const now = moment().format("YYYY-MM-DD HH:mm");
            console.log(`${now} -- ${id} ( sid = ${sid} ) sent to ${USEHOST} status: ${res.status} `);
            if (debug) {
                console.log(res);
            }
        })
        .catch((error) => {
            console.log(`Status: ${error.response.status}`);
            console.log(error.response.config.headers);
            console.log(error.response.config.data);
            console.log(error.response.data.detail);
//            console.error(error)
        })
}