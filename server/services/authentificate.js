const { MoleculerError } = require("moleculer").Errors;


module.exports = {
	mixins: {
		actions: {
			"api.validate": {
				params: {
					body: {
						type: "object",
						props: {
							username: {
								type: "string",
							},
							accessToken: {
								type: "string"
							}
						}
					}
				},
				handler(ctx) {
					const { body } = ctx.params;
					return ctx.broker.call("Tokens.find", {query: {username: body.username, accessToken: body.accessToken}})
						.then((tokens) => {
							if (tokens.length === 0) {
								throw new MoleculerError("Unauthorized", 401, "INVALID_ACCESS_TOKEN");// ///change type to forbidden
							}
							const firstToken = tokens.shift();
							let now = Date.now();
							let exp = new Date(firstToken.expirate).getTime();
							if (exp - now <= 0) {
								throw new MoleculerError("Unauthorized", 401, "EXPIRED_ACCESS_TOKEN");// ///change type to expired
							} else if (exp - now > 0) {
								return firstToken;
							}
						});
				}
			},
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
					const {body} = ctx.params;
					return ctx.broker.call("Users.find", {query: {username: body.username, password: body.password}})
						.then((users) => {
							if (users.length === 1) {
								return ctx.broker.call("Tokens.api.create", {body: {username: body.username}})
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
	}, {
		path: "/validateToken",
		mappingPolicy: "restrict",
		mergeParams: false,
		bodyParsers: {
			json: true,
		},
		aliases: {
			"POST ": "Tokens.api.validate",
		}
	}],
};
