"use strict";


const DbService = require("moleculer-db");
const MongoAdapter = require("moleculer-db-adapter-mongo");
const JaegerService = require("moleculer-jaeger");



const ApiGateway = require("../modules/open-api");

const AuthentificateService = require("./authentificate")


module.exports = {
  name: "autorisation",
  mixins: [ApiGateway],
  metrics: true,
  // More info about settings: https://moleculer.services/docs/0.13/moleculer-web.html
  settings: {};
}
