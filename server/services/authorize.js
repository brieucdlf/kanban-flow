const { MoleculerError } = require("moleculer").Errors;


module.exports = {
  mixins: {
    actions: {
      "api.authorize": {
        params: {
          body: {
            type: "object",
            props: {
              token: {
                type: "string",
              },
              username: {
                type: "string"
              }
            }
          }
        },
        handler(ctx) {
          const { body } = ctx.params;
          return ctx.broker.call("Acl.find", {query: {links: {containsUser:body.username}}})
            .then((aclCollection) => {
              if (aclCollection.length === 0) {
             return [];
              }
             return aclCollection.shift().scopes;
            });
        }
      },

  },
  routes: [{
    path: "/authorize",
    mappingPolicy: "restrict",
    mergeParams: false,
    bodyParsers: {
      json: true,
    },
    aliases: {
      "POST ": ".api.auth",
    }
  }],
};
