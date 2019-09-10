"use strict";

const ApiGateway = require("moleculer-web");

const jwt = require('jsonwebtoken');

const fs = require('fs');

const PUBLIC_KEY = fs.readFileSync(__dirname + '/private.pem', 'utf8');

module.exports = {
  name: "authorize",
  mixins: [ApiGateway],
  metrics: true,
  settings:{
    routes:[{
      path:"/authorize",
      aliases:{
        GET: "authorize.get"
      }
    }]
  },
  actions: {
    get: {
      params: {
        username: {
          type: "string",
        }
      },
      handler(ctx) {
        const {user, token} = ctx.params;
        const identifier = {
          user,
          token,
          scopes: [],
        };
        return ctx.broker.call("Acl.find", {query: {links: {containsUser:user.username}}})
          .then((aclCollection) => {
            if (aclCollection.length === 0) {
              return identifier;
            }
            identifier.scopes = aclCollection.shift().scopes;
            return jwt.sign(identifier, PUBLIC_KEY, {algorithm: 'HS512'});
          }, (error) => {
            console.error('une Erreur est survenu lors de la récupération des ACL : ', error);
            throw new Error(error);
          });
      }
    },
  },
};
