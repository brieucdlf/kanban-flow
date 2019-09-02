const { MoleculerError } = require("moleculer").Errors;


module.exports = {
	mixins: {
		actions: {
			"api.auth": {
				params: {
					body: {
						type: "object",
						props: {
							password: {
								type: "string",
							},
							username: {
								type: "string",
							}
						}
					}
				},
				handler(ctx) {
					const { body } = ctx.params;
					return ctx.broker.call("Users.find", {query: {username: body.username, password: body.password}})
						.then((users) => {
							if(users.length === 1) {
								return ctx.broker.call('Tokens.api.create', {body: {username: body.username}});
							}
							throw new MoleculerError("Auth Error", 404, "NOT_FOUND");
						});
				}
			}
		},
	},
	routes: [{
		path: "/authentificate",
		mappingPolicy: "restrict",
		mergeParams: false,
		bodyParsers: {
			json: true,
		},
		aliases: {
			"POST ": "Tokens.api.auth",
		}
	}],
};
