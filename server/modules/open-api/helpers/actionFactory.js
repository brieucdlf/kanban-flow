

module.exports = {
  createAction(actionName, method) {

    return {
      params: {},
      graphql: {},
      handler(ctx) {
        console.log("~~PARAMS~~");
        console.log(ctx.params);
        console.log("~~~~");
        
        return "toto";
      }
    }
  }
};
