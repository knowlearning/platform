const tePairs = [
    ["application/javascript;syntax=vue-template", "vue"],
    ["application/javascript", "js"],
    ["application/json", "json"],
    ["text/html", "html"],
    ["text/css", "css"],
    ["text/plain", "txt"],
    ["text/yaml", "yaml"],
    ["image/png", "png"],
    ["text/plain;syntax=Dockerfile", "Dockerfile"]
  ]
  
  const typeToExtensionMap = tePairs.reduce((o,[t,e]) => (o[t]=e, o), {})
  const extensionToTypeMap = tePairs.reduce((o,[t,e]) => (o[e]=t, o), {})
  
  // TODO: do better fallback matching (do a smarter look at params/subtypes)
  const typeToExtension = t => typeToExtensionMap[t] || typeToExtensionMap[t.split(';')[0]]
  const extensionToType = e => extensionToTypeMap[e] || "text/plain"
  
  export { typeToExtension, extensionToType }