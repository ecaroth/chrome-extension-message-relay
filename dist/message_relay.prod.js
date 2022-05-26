/* Version 2.1.2 chrome-extension-message-relay (https://github.com/ecaroth/chrome-extension-message-relay), Authored by Evan Carothers */

(()=>{"use strict";const e=function(e,t,n,i){i||(i="*");const s=n||!1,o=Object.freeze({extension:"extension",content:"content",page:"page",iframe:"iframe",iframe_shim:"iframe_shim",test:"test"}),r=Object.freeze({extension:4,content:3,page:2,iframe_shim:1,iframe:0,test:-1}),a=t;let m={},l=null,f=e,c=null,d=null,g={},u={},p=null;function _(e){let t=e.split(".");return{type:t.splice(0,1)[0],namespace:t.length>0?t.join("."):null}}function h(e,t){if(e in g)for(let n=g[e].length-1;n>=0;n--)g[e][n].ns===t&&g[e].splice(n,1)}function y(e,t,n,i,s){s||(s={});let o="msg_id"in s?s.msg_id:`${t}:${e}:${(new Date).getTime()}`;s.msg_id=o;let r={msg_type:e,msg_from:a,source_level:n,msg_destination:t,msg_up:i,msg_namespace:f,msg_data:s,msg_id:o,msg_tab_id:null},m=v(t);return m.tab_id&&(r.msg_destination=m.level,r.msg_tab_id=m.tab_id),r}function $(e){!function(e,t){if(e===o.extension)if(t.msg_tab_id)u[t.msg_tab_id]=u[t.msg_tab_id]||[],u[t.msg_tab_id].push(t);else for(var n in u)u[n].push(t);else if(e===o.content&&t.msg_destination===o.extension||e===o.extension)p.postMessage(t);else if(e===o.iframe||t.msg_destination!==o.iframe&&e===o.iframe_shim)window.parent.postMessage(t,i);else if(e!==o.page&&e!==o.content||![o.iframe,o.iframe_shim].includes(t.msg_destination))if(t.msg_destination===o.iframe&&e===o.iframe_shim)for(let e=0;e<window.frames.length;e++)window.frames[e].postMessage(t,"*");else window.postMessage(t,"*");else{if(e===o.page)return;let n=document.getElementsByTagName("iframe");for(let e=0;e<n.length;e++){let i="chrome-extension://"+chrome.runtime.id;n[e].src.startsWith(i)&&n[e].contentWindow.postMessage(t,i)}}}(a,e)}function b(e,t){let{msg_data:n,msg_from:i,source_level:s,msg_up:o,msg_destination:l,msg_type:f,msg_id:u}=JSON.parse(JSON.stringify(e));t&&(c=t),d=f;let p=`${u}:${l}`;if(i===a||p in m)return!1;l===a?(w(`Msg (${f}) received from ${i} to ${l} - ${JSON.stringify(n)}`),m[p]=0,function(e,t,n){if(!(e in g))return;g[e].forEach((e=>{let i=e.limit_from_levels;i&&!i.includes(n)||e.fn.call(e,t)}))}(f,n,s)):(e.msg_from=a,o&&r[a]>r[i]?($(e),w(`Msg (${f}) relaying UP from ${i} to ${l} - ${JSON.stringify(n)}`)):!o&&r[a]<r[i]&&($(e),w(`Msg (${f}) relaying DOWN ${i} to ${l} - ${JSON.stringify(n)}`)))}function v(e){let t=e.split("@");return{level:t[0],tab_id:t.length>0?parseInt(t[1],10):null}}function w(e){s&&console.log(`::MSG-RELAY (${a}):: ${e}`)}function x(e,t){let n=y(e,a,a,!0,t);n.msg_from="mock",b(n,{tabId:999})}function M(){for(let e in m)0===m[e]?m[e]=1:delete m[e]}function E(){clearInterval(l)}function O(e){this.name="ChromeExtensionMessageRelayError",this.message=e||"Error in chrome extension message relay",this.stack=(new Error).stack}if(l=setInterval(M,12e4),O.prototype=Object.create(Error.prototype),O.prototype.constructor=O,!(a!==o.content&&a!==o.extension||chrome&&chrome.runtime&&chrome.runtime.id)){throw new O(`ERROR - invalid context detected for ${a}, aborting.`)}return a!==o.test&&([o.page,o.content,o.iframe,o.iframe_shim].includes(a)&&window.addEventListener("message",(e=>{"object"==typeof e.data&&"msg_namespace"in e.data&&e.data.msg_namespace===f&&b(e.data)})),a===o.content&&(w("Alerting extension of ready"),p=chrome.runtime.connect({name:e}),p.onMessage.addListener((e=>{b(e)}))),a===o.extension&&chrome.runtime.onConnect.addListener((t=>{t.name===e&&t.sender.id===chrome.runtime.id&&function(e){let t=e.sender.tab.id,n=Array.isArray(u[t])?u[t].slice():[];e.onDisconnect.addListener((e=>{delete u[e.sender.tab.id],E()})),e.onMessage.addListener((t=>{e.sender.id===chrome.runtime.id&&b(t,e.sender)})),u[t]={push:t=>{e.postMessage(t)}},n.forEach((e=>u[t].push(e)))}(t)}))),{levels:o,on:function(e,t,n=null){"string"==typeof e&&(e=[e]),n&&!Array.isArray(n)&&(n=[n]),e.forEach((e=>{let i=_(e);i.type in g||(g[i.type]=[]),g[i.type].push({fn:t,ns:i.namespace,limit_from_levels:n})}))},off:function(e){"string"==typeof e&&(e=[e]),e.forEach((e=>{let t=_(e);t.type in g&&(t.namespace?h(t.type,t.namespace):delete g[t.type])}))},offAll:function(e){if(e)for(let t in g)h(t,e);else g={}},send:function(e,t,n){"string"==typeof t&&(t=[t]),t.forEach((t=>{if(!function(e){if(!e)return!1;return v(e).level in o}(t))return w(`NOTICE - invalid level specified as destination (${t})`);let i=v(t).level;r[i]<r[a]?function(e,t,n){let i=y(e,t,a,!1,n);w(`Send msg DOWN from ${a} to ${t} : ${e} - ${JSON.stringify(n)}`),$(i)}(e,t,n):function(e,t,n){let i=y(e,t,a,!0,n);w(`Send msg UP from ${a} to ${t} : ${e} - ${JSON.stringify(n)}`),$(i)}(e,t,n)}))},levelViaTabId:function(e,t){return`${e}@${t}`},getLastMsgSenderInfo:()=>c,getLastMsgType:()=>d,mockSend:x,localSend:x,clearTMO:E}};"undefined"!=typeof module&&module.exports?module.exports=e:window.chrome_extension_message_relay=e})();