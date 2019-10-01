
function getParamKey(key) {
  switch(key) {
    case "query": return "query";
    case "path": return "params";
  }
  return "";
}

function parseParameter(definition) {
  const key = getParamKey(definition.in);
  const schema = {...definition.schema};
  if (definition.required) {
    schema.optional = false;
  }
  if (key.length > 0) {
    return {
      [key] : {
        [definition.name]: schema,
      }
    };
  }
  return null;
};

module.exports = {
  parseParameter,
};
