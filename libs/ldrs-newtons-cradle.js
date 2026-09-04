(()=>{var n=class extends HTMLElement{_propsToUpgrade={};shadow;template;defaultProps;isAttached=!1;constructor(){super(),this.shadow=this.attachShadow({mode:"open"}),this.template=document.createElement("template")}storePropsToUpgrade(e){e.forEach((t=>{this.hasOwnProperty(t)&&this[t]!==void 0&&(this._propsToUpgrade[t]=this[t],delete this[t])}))}upgradeStoredProps(){Object.entries(this._propsToUpgrade).forEach((([e,t])=>{this.setAttribute(e,t)}))}reflect(e){e.forEach((t=>{Object.defineProperty(this,t,{set(s){"string,number".includes(typeof s)?this.setAttribute(t,s.toString()):this.removeAttribute(t)},get(){return this.getAttribute(t)}})}))}applyDefaultProps(e){this.defaultProps=e,Object.entries(e).forEach((([t,s])=>{this[t]=this[t]||s.toString()}))}};var o=':host{align-items:center;display:inline-flex;flex-shrink:0;height:calc(var(--uib-size)*.3);justify-content:center;width:var(--uib-size)}:host([hidden]){display:none}.container{height:calc(var(--uib-size)*.51);justify-content:center;top:28%;width:51%}.container,.dot{align-items:center;display:flex;position:relative}.dot{flex-shrink:0;height:100%;transform-origin:center top;width:25%}.dot:after{background-color:var(--uib-color);border-radius:50%;content:"";display:block;height:25%;transition:background-color .3s ease;width:100%}.dot:first-child{animation:swing var(--uib-speed) linear infinite}.dot:last-child{animation:swing2 var(--uib-speed) linear infinite}@keyframes swing{0%{animation-timing-function:ease-out;transform:rotate(0deg)}25%{animation-timing-function:ease-in;transform:rotate(70deg)}50%{animation-timing-function:linear;transform:rotate(0deg)}}@keyframes swing2{0%{animation-timing-function:linear;transform:rotate(0deg)}50%{animation-timing-function:ease-out;transform:rotate(0deg)}75%{animation-timing-function:ease-in;transform:rotate(-70deg)}}',r=class extends n{_attributes=["size","color","speed"];size;color;speed;static get observedAttributes(){return["size","color","speed"]}constructor(){super(),this.storePropsToUpgrade(this._attributes),this.reflect(this._attributes)}connectedCallback(){this.upgradeStoredProps(),this.applyDefaultProps({size:78,color:"black",speed:1.4}),this.template.innerHTML=`
      <div class="container">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
      <style>
        :host{
          --uib-size: ${this.size}px;
          --uib-color: ${this.color};
          --uib-speed: ${this.speed}s;
        }
        ${o}
      </style>
    `,this.shadow.replaceChildren(this.template.content.cloneNode(!0))}attributeChangedCallback(){let e=this.shadow.querySelector("style");e&&(e.innerHTML=`
      :host{
        --uib-size: ${this.size}px;
        --uib-color: ${this.color};
        --uib-speed: ${this.speed}s;
      }
      ${o}
    `)}},a={register:(i="l-newtons-cradle")=>{customElements.get(i)||customElements.define(i,class extends r{})},element:r};a.register();})();
