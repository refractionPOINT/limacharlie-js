require("babel-polyfill");

const Manager = require('./Manager');
const Sensor = require('./Sensor');
const Spout = require('./Spout');
const Webhook = require('./Webhook');

module.exports = {
    Manager: Manager,
    Sensor: Sensor,
    Spout: Spout,
    Webhook: Webhook,
}