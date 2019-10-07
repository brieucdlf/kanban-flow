



// generateReadAction(entityType, paramsFn, headers, info, pathLinkHydrater, graphQL) {
//   const entityName = entityType.replace(/^#\/([a-zA-Z0-9]+\/)+/, '');
//   const queryName = `get${entityName.charAt(0).toUpperCase()}${entityName.slice(1)}`
//   return {
//     graphql: {
//       query: `${queryName}${graphQL.params}: ${entityName}`
//     },
//     handler(ctx) {
//       return paramsFn(Object.assign({}, ctx.params, ctx.params.params, ctx.params.query), this)
//       .then((params) => ctx.broker.call(`${ctx.service.name}.get`, params, {parentCtx:ctx.meta.$span}))
//       .then((results) => {
//         return pathLinkHydrater(ctx.broker, "", "", ctx.params.body, results, ctx.meta, ctx)
//         .then((linksResult) => {
//           if (ctx.meta.hydrateDepth > 0 || !ctx.meta.isHttp || ctx.meta.isGraphQl) {
//             return Object.assign(results, linksResult)
//           }
//           const links = this.createLinksHeader(linksResult);
//           ctx.meta.$responseHeaders = {
//             links,
//           };
//           return results;
//         })
//
//       })
//       .then((result) => this.bodyResponseFormat(result), err => {throw err});
//     }
//   }
// },

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
  return "query";
  if (/create|update|delete$/.test(action)) {
    return "mutation";
  }
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
function createGQLDefinition(serviceName, method, action, type) {
  const name = serviceName.substr(0, 1).toUpperCase()+serviceName.substr(1);
  const def = {
    [selectFnType(action)] : `${handlers[action]}${serviceName}(): ${name.substr(0, name.length -1)}`
  }
  return def;
}

module.exports = {
  createAction(actionName, method, serviceName) {
    const dbFn = actionName.substr((actionName.lastIndexOf('.')+1))
    const graphQlFn = createGQLDefinition(serviceName, method, dbFn, "jjjj");
    return {
      params: {},
      graphql: {
        ...graphQlFn,
      },
      handler(ctx) {
        console.log("~~PARAMS~~", actionName);
        const params = parseParams(handlers[dbFn], ctx.params);
        console.log(params);
        console.log("~~~~");
        return ctx.broker.call(`${ctx.service.name}.${handlers[dbFn]}`, params)
        return "toto";
      }
    }
  }
};
