const handlers = {
  read  : "get",
  update: "update",
  delete: "delete",
  search: "find",
  create: "create",
}
function parseParams(action, params) {
  switch(action) {
    case "get": return params.params;
    case "find": return {query: Object.assign(params.params, params.query)};
    case "update": return Object.assign(params.body, params.params);
    case "create": return params.body;
    case "delete": return params.params;
  }
  return {}
}

function selectFnType (action) {
  if (/create|update|delete$/.test(action)) {
    return "mutation";
  }
  return "query";
}
function setDefaultParams(action) {
  switch(action) {
    case "get": return "";
    case "find": return "";
    case "update": return "";
    case "create": return "";
    case "delete": return "";
  }
  return {}
}
function createGQLDefinition(serviceName, method, action) {
  const name = serviceName.substr(0, 1).toUpperCase()+serviceName.substr(1);
  const def = {
    [selectFnType(action)] : `${handlers[action]}${serviceName}(%params%): ${name.substr(0, name.length -1)}`
  }
  return def;
}

module.exports = {
  createAction(actionName, method, serviceName) {
    const dbFn = actionName.substr((actionName.lastIndexOf('.')+1))
    const graphQlFn = createGQLDefinition(serviceName, method, dbFn);
    return {
      params: {},
      graphql: {
        ...graphQlFn,
      },
      sanitizeSchema: {},
      inputSchema: {},
      handler(ctx) {
        console.log("~~PARAMS~~", actionName);
        console.log(ctx.params);
        const params = parseParams(handlers[dbFn], ctx.params);
        console.log("~~~~");
        return ctx.broker.call(`${ctx.service.name}.${handlers[dbFn]}`, params)
      }
    }
  }
};
