"use strict";

const DbService = require("moleculer-db");
const MongoAdapter = require("moleculer-db-adapter-mongo");

module.exports = {
	name: "db",
	mixins: [DbService],
	adapter: new MongoAdapter("mongodb://mongodb/boards"),
	collection: "entities",
	// More info about settings: https://moleculer.services/docs/0.13/moleculer-web.html
};
