/* Version 3.0.0 chrome-extension-message-relay (https://github.com/ecaroth/chrome-extension-message-relay), Authored by Evan Carothers */

export const relay=(e=>function(t,n,i,s){s||(s="*");const o=i||!1,r=Object.freeze({service_worker:"service_worker",content:"content",page:"page",iframe:"iframe",iframe_shim:"iframe_shim",test:"test"}),a=Object.freeze({extension:4,content:3,page:2,iframe_shim:1,iframe:0,test:-1}),l=n;let c={},m=null,f=t,d=null,u=null,g={},p=[],h={};const y="_CSTATE",_=Object.freeze({ready:"ready",initEnv:"initEnv",initialized:"initalized"}),$={},v="***";function I(e,t,n=null,i=null){"string"==typeof e&&(e=[e]),n&&!Array.isArray(n)&&(n=[n]),e.forEach((e=>{let s=E(e);s.type in g||(g[s.type]=[]),g[s.type].push({fn:t,ns:s.namespace,limitFromLevels:n,componentId:i})}))}function b(e,t=null){e&&("string"==typeof e&&(e=[e]),e.forEach((e=>{let t=E(e);t.type in g&&(t.namespace?O(t.type,t.namespace):delete g[t.type])})))}function w(e,t=null,n=null){let i=e;return t&&(i+="."+t),n&&(i+=`[${n}]`),i}function E(e){let t=null,n=null,i=null;const s=(e=e.split("@@@")[0]).match(/^([\w:_-]+)\.?([\w:_-]+)?(\[(.+)])?$/);return s[2]?(n=s[2],t=s[1]):t=s[1],s[4]&&(i=s[4]),{type:t,namespace:n,component:i}}function O(e,t){if(e in g)for(let n=g[e].length-1;n>=0;n--)g[e][n].ns===t&&g[e].splice(n,1)}function S(e,t,n,i,s){let o="msgId"in(s=A(s))?s.msgId:function(e,t){return`${e}:${t}@@@${R()}`}(t,e);s.msgId=o;let r={msgType:e,msgFrom:l,sourceLevel:n,msgDestination:t,msgUp:i,relayNamespace:f,msgData:s,msgId:o,msgTabId:null};const a=k(t);return a.tabId&&(r.msgDestination=a.level,r.msgTabId=a.tabId),r}function M(e,t,n,i=null){if(n=A(n),"string"==typeof t&&(t=[t]),i){const t=E(e);e=w(t.type,t.namespace,i)}t.forEach((t=>{if(!function(e){return!!e&&k(e).level in r}(t))return L(`NOTICE - invalid level specified as destination (${t})`);const i=k(t).level;a[i]<a[l]?C(e,t,n):function(e,t,n){const i=S(e,t,l,!0,n);L(`Send msg UP from ${l} to ${t} : ${e} - ${JSON.stringify(n)}`),T(i)}(e,t,n)}))}function C(e,t,n={}){const i=S(e,t,l,!1,n);L(`Send msg DOWN from ${l} to ${t} : ${e} - ${JSON.stringify(n)}`),T(i)}function T(t){!function(t,n){if(t===r.content&&n.msgDestination===r.service_worker||t===r.service_worker);else if(t===r.iframe||n.msgDestination!==r.iframe&&t===r.iframe_shim)e.parent.postMessage(n,s);else if(t!==r.page&&t!==r.content||![r.iframe,r.iframe_shim].includes(n.msgDestination))if(n.msgDestination===r.iframe&&t===r.iframe_shim)for(let t=0;t<e.frames.length;t++)e.frames[t].postMessage(n,"*");else e.postMessage(n,"*");else{const e=document.getElementsByTagName("iframe"),{component:t}=E(n.msgType);for(let i=0;i<e.length;i++){if(t&&!t.startsWith(v)&&e[i].getAttribute(D(t))!==_.ready)continue;let s="*";(l!==r.content||(s="chrome-extension://"+chrome.runtime.id,e[i].src.startsWith(s)))&&e[i].contentWindow.postMessage(n,s)}}}(l,t)}function N(e,t){const{msgData:n,msgFrom:i,sourceLevel:s,msgUp:o,msgDestination:m,msgType:f,msgId:$}=e;t&&(d=t),u=E(f);const I=`${$}:${m}`;if(i===l||I in c)return!1;m===l?(L(`Msg (${f}) received from ${i} to ${m} - ${JSON.stringify(n)}`),c[I]=0,function(e,t,n){delete t.msgId;const{component:i,namespace:s,type:o}=E(e);if(i&&[r.content,r.page].includes(l)){const e=d,t=Array.from(document.getElementsByTagName("iframe")).find((t=>t.contentWindow===e));if(s===y){if(o===_.ready){L(`Component ${i} is ready`);const e=D(i);t.setAttribute(e,_.ready);let n=function(e,t){return w(e,y,t)}(_.initEnv,i);return C(n,r.iframe,h)}if(o===_.initialized){const e=z(i);p.forEach((n=>{n.name_filter&&0!==e.localeCompare(n.name_filter)||n.fn(e,t,d)}))}}}if(!(o in g))return;g[o].forEach((e=>{const s=e.limitFromLevels;if(!s||s.includes(n)){if(i&&l===r.iframe&&i!==v){if(!i.startsWith(v)&&i!==e.componentId)return;if(i.startsWith(v)){if(z(e.componentId)!==i.replace(v,""))return}}e.fn.call(e,t)}}))}(f,n,s)):(e.msgFrom=l,o&&a[l]>a[i]?(T(e),L(`Msg (${f}) relaying UP from ${i} to ${m} - ${JSON.stringify(n)}`)):!o&&a[l]<a[i]&&(T(e),L(`Msg (${f}) relaying DOWN ${i} to ${m} - ${JSON.stringify(n)}`)))}function D(e){return"relay-component-"+e.replace(/[\W]/g,"-").replace(/-+$/,"")}function z(e){const t=e.match(/^(.+){[a-z0-9-]+}$/);return t?t[1]:null}function k(e){let t=e.split("@"),n=t.length>0?parseInt(t[1],10):null;return{level:t[0],tab_id:n,tabId:n}}function A(e){if(null==e&&(e={}),"object"!=typeof e)throw new j("Data payload for message must be an object");let t;try{t=JSON.parse(JSON.stringify(e))}catch(e){throw new j("Data payload for message included non-JSON-serizable data")}return t}function L(e){o&&console.log(`::MSG-RELAY (${l}):: ${e}`)}function W(e,t){t=A(t);const n=S(e,l,l,!0,t);n.msgFrom="mock",N(n,{tabId:999})}function J(){for(let e in c)0===c[e]?c[e]=1:delete c[e]}function R(){return Math.random().toString(36).substring(2,15)+Math.random().toString(36).substring(2,15)}function j(e){this.name="ChromeExtensionMessageRelayError",this.message=e||"Error in chrome extension message relay",this.stack=(new Error).stack}if(m=setInterval(J,12e4),j.prototype=Object.create(Error.prototype),j.prototype.constructor=j,!(l!==r.content&&l!==r.service_worker||chrome&&chrome.runtime&&chrome.runtime.id)){throw new j(`ERROR - invalid context detected for ${l}, aborting.`)}l!==r.test&&([r.page,r.content,r.iframe,r.iframe_shim].includes(l)&&e.addEventListener("message",(e=>{"object"==typeof e.data&&"relayNamespace"in e.data&&e.data.relayNamespace===f&&N(e.data,e.source)})),r.content,r.service_worker);const x={levels:r,on:I,off:e=>{b(e)},componentOff:(e,t)=>{b(e,t)},offAll:function(e){if(e)for(let t in g)O(t,e);else g={}},send:M,levelViaTabId:function(e,t){return`${e}@${t}`},levelViaComponentId:function(e){return`${l}@${e}`},getLastMsgSenderInfo:()=>d,getLastMsgType:()=>u.type,getLastMsg:()=>u,mockSend:W,localSend:W,componentSend:function(e,t,n=null){const i=E(e),s=v+(n||"");if(e=w(i.type,i.namespace,s),l===r.iframe)return W(e,t);C(e,r.iframe)},componentOn:function(e,t,n){if(![r.page,r.content,r.iframe_shim].includes(l))throw new j("Cannot bind component on listeners in this level");const i=v+t;I(e,n,[r.iframe,r.iframe_shim],i)},componentRespond:function(e,t){const n=u;n.component&&M(e,r.iframe,t,n.component)},clearTMO:function(){clearInterval(m)},registerComponentInitializedCb:(e,t=null)=>{p.push({fn:e,name_filter:t})},setComponentEnvData:e=>{h=e},getComponentEnvData:()=>h};class F{constructor(e,t,n=!1){this.enabled=!0,this._relay=e,this._componentName=t,this._componentId=`${t}{${R()}}`,this._debug=n,this._ready=!1,this._initialized=!1,this._pendingInitCalls=[]}get _initMsg(){return`${_.initEnv}._CSTATE`}markReady(e=null){const t=e=>{this._ready||(this._log("markReady"),this.enabled&&(this.on(this._initMsg,(t=>{for(e(t);this._pendingInitCalls.length;){let e=this._pendingInitCalls.shift();e.cb(e.data)}this.off(this._initMsg)})),this.send(`${_.ready}._CSTATE`),this._ready=!0))};return e?t(e):new Promise((e=>{t(e)}))}markInitialized(){this._initialized||(this._log("MarkInitialized"),this.enabled&&(this._initialized=!0,this.send(`${_.initialized}._CSTATE`)))}_log(...e){if(!this._debug)return;const t=Array.from(arguments);t.unshift(`[${this.enabled?"":"DISABLED "}COMPONENT ${this._componentId}`),console.warn(...t)}on(e,t){if(this._log(">>> .on",e),!this.enabled)return;let n=[this._relay.levels.page,this._relay.levels.content,this._relay.levels.iframe_shim];this._relay.on(e,(n=>{if(!this._ready&&e!==this._initMsg)return this._pendingInitCalls.push({cb:t,data:n});t(n)}),n,this._componentId)}send(e,t={}){if(this._log(">>> .send",e,t),!this.enabled)return;let n=[this._relay.levels.page,this._relay.levels.content];this._relay.send(e,n,t,this._componentId)}off(e){this._log(">>> .off",e),this._relay.componentOff(e,this._componentId)}}return x.newComponent=(e,t=!1)=>{if(l!==r.iframe)throw new j("You can only create a component in an iframe level.");let n=new F(x,e,t);return $[n.id]=n,n},x})(void 0!==this?this:"undefined"==typeof window?{}:window);