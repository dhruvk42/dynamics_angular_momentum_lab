/* Interactive undergraduate dynamics models. All quantities are SI. */
(() => {
  'use strict';

  const C = { ink:'#173249', muted:'#7591a3', blue:'#2e6db3', teal:'#16999a', gold:'#dc9536', red:'#cc6374', rail:'#c7d7e2', paper:'#fbfdff' };
  const TAU = 2*Math.PI;
  const duration = 12;
  const params = {
    flywheel:{m:4,R:.6,w:2.1,alpha:.12},
    rolling:{m:2,R:.5,v:1.1},
    slider:{a:1,b:2.3,mc:1.5,mr:2.2,ms:1,w:1.05},
    gyro:{Ip:.14,I3:.082,beta:33,spin:12.6,Omega:.9},
    platform:{Ip:1.15,m:2,r0:1,wr:2.5,r:.55}
  };
  const original = JSON.parse(JSON.stringify(params));
  const modes = {
    flywheel:{num:'01',title:'Flywheel angular momentum',description:'See how a disk’s inertia and angular speed set its angular momentum about its center.',tag:'ABOUT G',inputs:[
      ['m','Disk mass','kg',.5,10,.1,1],['R','Disk radius','m',.2,1.2,.05,2],['w','Initial angular speed','rad/s',-6,6,.1,2],['alpha','Angular acceleration','rad/s²',-.8,.8,.02,2]
    ],question:'If the radius doubles while mass and angular speed stay fixed, what happens to angular momentum?',answer:'For a solid disk, I<sub>G,z</sub> = ½mR². Doubling R makes I and H four times as large. The same percentage change in angular speed produces the same percentage change in H.'},
    rolling:{num:'02',title:'Rolling disk angular momentum',description:'Compare angular momentum about the moving center G and the instantaneous contact point P.',tag:'ABOUT G AND P',inputs:[
      ['m','Disk mass','kg',.5,6,.1,1],['R','Disk radius','m',.25,1.0,.05,2],['v','Center velocity','m/s',-2,2,.05,2]
    ],question:'The same rolling wheel has two different values of H. How can both be correct?',answer:'Angular momentum depends on the reference point. For a solid disk rolling without slipping, H<sub>P,z</sub> = (I<sub>G,z</sub> + mR²)ω = 3H<sub>G,z</sub>. P is a different ground point at each instant.'},
    slider:{num:'03',title:'Slider–crank angular momentum',description:'Track how the crank and connecting rod contribute spin and orbital angular momentum.',tag:'ABOUT FIXED PIVOT O',inputs:[
      ['a','Crank length','m',.4,1.4,.05,2],['b','Connecting rod length','m',1.5,3.5,.05,2],['mc','Crank mass','kg',.5,4,.1,1],['mr','Rod mass','kg',.5,5,.1,1],['ms','Slider mass','kg',.5,5,.1,1],['w','Crank angular speed','rad/s',-2.5,2.5,.05,2]
    ],question:'Why is the slider’s angular momentum about O exactly zero, even though it is moving?',answer:'The slider moves along a rail passing through O. Its position vector and momentum are parallel, so r<sub>S/O</sub> × m<sub>s</sub>v<sub>S</sub> = 0. It still has nonzero translational kinetic energy.'},
    gyro:{num:'04',title:'Gyroscopic precession',description:'Explore a symmetric rotor whose spin axis sweeps around the vertical direction.',tag:'WORLD XYZ COMPONENTS',inputs:[
      ['Ip','Transverse inertia','kg·m²',.05,.35,.005,3],['I3','Axial inertia','kg·m²',.03,.3,.001,3],['beta','Tilt angle β','degrees',15,70,1,0],['spin','Rotor spin ψ̇','rad/s',4,25,.2,1],['Omega','Precession Ω','rad/s',-1.5,1.5,.05,2]
    ],question:'A gyroscope’s H vector changes direction even when its magnitude stays fixed. Does that require torque?',answer:'Yes. A changing direction gives dH/dt ≠ 0. In this prescribed steady-precession model, τ = Ωe<sub>z</sub> × H. The gold arrow is the exact H from the inertia tensor, not just an assumed axle direction.'},
    platform:{num:'05',title:'Conservation on a rotating platform',description:'Move a person toward the center and observe how the angular speed adjusts to conserve H.',tag:'CONSERVATION ABOUT Z',inputs:[
      ['Ip','Platform inertia','kg·m²',.2,4,.05,2],['m','Person mass (point model)','kg',.5,5,.1,1],['r0','Reference radius','m',.3,1.4,.05,2],['wr','Reference angular speed','rad/s',-5,5,.1,2],['r','Current radius','m',.15,1.5,.05,2]
    ],question:'The person moves inward and spins faster. Where did the extra rotational kinetic energy come from?',answer:'Angular momentum can remain constant while kinetic energy changes. The person does work when moving inward against the effective centrifugal tendency. Here H<sub>z</sub> is fixed, while ω = H<sub>z</sub>/I changes with radius.'}
  };

  const scene = document.getElementById('scene');
  const ctx = scene.getContext('2d');
  const history = document.getElementById('history');
  const hctx = history.getContext('2d');
  const scrub = document.getElementById('time-scrub');
  const playBtn = document.getElementById('play-btn');
  const modeTabs = [...document.querySelectorAll('.mode-tab')];
  let mode = modes[location.hash.slice(1)] ? location.hash.slice(1) : 'flywheel';
  let t = 0, playing = true, lastFrame = 0, rate = 1, showVectors = true, showTrace = true, revealed = false;
  let frameNo = 0;

  function f(x,d=2) {if(Math.abs(x)<.5*10**(-d))x=0;return Number(x).toFixed(d);}
  const sub = (x) => `<sub>${x}</sub>`;
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
  const magnitude = v => Math.hypot(...v);
  const colorFor = i => [C.blue,C.teal,C.gold][i];

  function compute(which,time,p) {
    if(which==='flywheel') {
      const I=.5*p.m*p.R**2, w=p.w+p.alpha*time, theta=p.w*time+.5*p.alpha*time*time;
      return {H:[0,0,I*w],I,w,theta,T:I*p.alpha,energy:.5*I*w*w};
    }
    if(which==='rolling') {
      const w=-p.v/p.R, theta=w*time, Ig=.5*p.m*p.R**2, Ip=Ig+p.m*p.R**2;
      return {H:[0,0,Ig*w],w,theta,Ig,Ip,HP:Ip*w,v:p.v};
    }
    if(which==='slider') {
      const {a,b,mc,mr,ms,w}=p, theta=w*time, co=Math.cos(theta),si=Math.sin(theta),d=Math.sqrt(b*b-a*a*si*si);
      const B=[a*co,a*si],S=[a*co+d,0],vB=[-a*w*si,a*w*co],vS=[-a*w*si-a*a*w*si*co/d,0];
      const G=[(B[0]+S[0])/2,B[1]/2],vG=[(vB[0]+vS[0])/2,vB[1]/2],wd=-a*w*co/d;
      const IGr=mr*b*b/12, Hc=mc*a*a*w/3, Hspin=IGr*wd, Horbit=mr*(G[0]*vG[1]-G[1]*vG[0]);
      const Hr=Hspin+Horbit;
      return {H:[0,0,Hc+Hr],theta,B,S,G,vB,vS,vG,wd,IGr,Hc,Hr,Hspin,Horbit,Hs:0,ms};
    }
    if(which==='gyro') {
      const beta=p.beta*Math.PI/180,phi=p.Omega*time,cb=Math.cos(beta),sb=Math.sin(beta),c=Math.cos(phi),s=Math.sin(phi),n=[sb*c,sb*s,cb];
      const A=p.I3*p.spin+(p.I3-p.Ip)*p.Omega*cb;
      const H=[A*n[0],A*n[1],p.Ip*p.Omega+A*n[2]],torque=[-p.Omega*H[1],p.Omega*H[0],0];
      return {H,n,A,beta,phi,torque,omega:[p.spin*n[0],p.spin*n[1],p.Omega+p.spin*n[2]]};
    }
    const I0=p.Ip+p.m*p.r0*p.r0,I=p.Ip+p.m*p.r*p.r,H0=I0*p.wr,w=H0/I;
    return {H:[0,0,H0],I0,I,w,theta:w*time,H0,energy:.5*I*w*w};
  }

  function updateMode(which) {
    mode=which;t=0;revealed=false;lastFrame=0;
    document.getElementById('mode-title').textContent=modes[mode].title;
    document.getElementById('mode-description').textContent=modes[mode].description;
    document.getElementById('mode-count').textContent=modes[mode].num+' / 05';
    document.getElementById('model-tag').textContent=modes[mode].tag;
    document.getElementById('challenge-question').textContent=modes[mode].question;
    document.getElementById('challenge-answer').innerHTML=modes[mode].answer;
    document.getElementById('challenge-answer').hidden=true;
    document.getElementById('reveal-btn').innerHTML='Reveal explanation <span>↗</span>';
    modeTabs.forEach(b=>{let active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false')});
    if(location.hash.slice(1)!==mode)historyReplace('#'+mode);
    buildInputs();updateAll();
  }

  function historyReplace(hash){try{window.history.replaceState(null,'',hash);}catch{/* embedding can disallow URL changes */}}

  function buildInputs() {
    const list=document.getElementById('parameter-list');list.replaceChildren();
    for(const [key,label,unit,min,max,step,dec] of modes[mode].inputs) {
      const parent=document.createElement('div');parent.className='param';
      const id='param-'+key;
      parent.innerHTML=`<div class="param-head"><label for="${id}">${label}</label><output id="output-${key}">${f(params[mode][key],dec)} <small>${unit}</small></output></div><input class="param-range" id="${id}" type="range" min="${min}" max="${max}" value="${params[mode][key]}" step="${step}" aria-label="${label}"><div class="range-limits"><span>${min}</span><span>${max} ${unit}</span></div>`;
      const input=parent.querySelector('input');
      input.addEventListener('input',()=>{
        params[mode][key]=Number(input.value);
        parent.querySelector('output').innerHTML=`${f(params[mode][key],dec)} <small>${unit}</small>`;
        updateAll();
      });
      list.appendChild(parent);
    }
  }

  function equationsFor(which,d,p) {
    switch(which) {
      case 'flywheel':return {
        rows:[['I<sub>G,z</sub> = ½mR²',`${f(d.I,3)} kg·m²`],['H<sub>G,z</sub> = I<sub>G,z</sub> ω',`${f(d.H[2],3)} kg·m²/s`],['τ<sub>z</sub> = I<sub>G,z</sub> α',`${f(d.T,3)} N·m`]],
        note:`Uniform solid disk; fixed axle through G. Current ω = ${f(d.w,2)} rad/s.`
      };
      case 'rolling':return {
        rows:[['ω = −v<sub>G</sub> / R',`${f(d.w,3)} rad/s`],['H<sub>G,z</sub> = I<sub>G,z</sub> ω',`${f(d.H[2],3)} kg·m²/s`],['H<sub>P,z</sub> = (I<sub>G,z</sub>+mR²) ω',`${f(d.HP,3)} kg·m²/s`]],
        note:`No slip, uniform disk; I<sub>G,z</sub> = ${f(d.Ig,3)} and I<sub>P,z</sub> = ${f(d.Ip,3)} kg·m². P denotes the instantaneous contact point.`
      };
      case 'slider':return {
        rows:[['H<sub>O,z</sub> = H<sub>O,c</sub> + H<sub>O,r</sub>',`${f(d.H[2],3)} kg·m²/s`],['H<sub>O,c</sub> = (m<sub>c</sub>a²/3) θ̇',`${f(d.Hc,3)} kg·m²/s`],['H<sub>O,r</sub> = I<sub>G,r</sub> β̇ + (r<sub>G/O</sub> × m<sub>r</sub>v<sub>G</sub>)<sub>z</sub>',`${f(d.Hr,3)} kg·m²/s`]],
        note:`Rod spin ${f(d.Hspin,3)} + rod orbital ${f(d.Horbit,3)} kg·m²/s. The slider contributes zero H about O, regardless of its mass ${f(p.ms,1)} kg.`
      };
      case 'gyro':return {
        rows:[['H = I<sub>⊥</sub>Ωe<sub>z</sub> + A n',`|H| = ${f(magnitude(d.H),3)} kg·m²/s`],['A = I<sub>3</sub> ψ̇ + (I<sub>3</sub>−I<sub>⊥</sub>) Ω cosβ',`${f(d.A,3)} kg·m²/s`],['τ = Ωe<sub>z</sub> × H',`|τ| = ${f(magnitude(d.torque),3)} N·m`]],
        note:`World-axis components use the full symmetric inertia tensor. This is prescribed steady precession, not torque-free motion.`
      };
      default:return {
        rows:[['I(r) = I<sub>p</sub> + mr²',`${f(d.I,3)} kg·m²`],['H<sub>z</sub> = [I<sub>p</sub>+mr<sub>0</sub>²] ω<sub>ref</sub>',`${f(d.H0,3)} kg·m²/s`],['ω(r) = H<sub>z</sub> / I(r)',`${f(d.w,3)} rad/s`]],
        note:`One point-mass person at radius r; an ideal platform with negligible external z torque. H is set by the reference configuration.`
      };
    }
  }

  function tensorFor(which,d,p) {
    const lineMatrix=(name,values,note='')=>{
      const matrix=values.map(row=>`<div class="matrix-row">${row.map(v=>`<span>${f(v,3)}</span>`).join('')}</div>`).join('');
      return `<div class="tensor-entry"><span class="tensor-label">${name}</span><div class="tensor-matrix" role="img" aria-label="Three by three inertia tensor in kilograms meters squared">${matrix}</div>${note?`<span class="tensor-note">${note}</span>`:''}</div>`;
    };
    const diag=(a,b,c)=>[[a,0,0],[0,b,0],[0,0,c]];
    switch(which) {
      case 'flywheel': {
        const J=p.m*p.R*p.R/4;
        return lineMatrix('I<sub>G</sub> =',diag(J,J,2*J),'Solid disk; axes through G');
      }
      case 'rolling': {
        const J=p.m*p.R*p.R/4;
        return lineMatrix('I<sub>G</sub> =',diag(J,J,2*J),'Center G') + lineMatrix('I<sub>P</sub> =',diag(J+p.m*p.R*p.R,J,2*J+p.m*p.R*p.R),'Contact point P');
      }
      case 'slider': {
        const Jc=p.mc*p.a*p.a/12,Jr=p.mr*p.b*p.b/12;
        return lineMatrix('I<sub>G,c</sub> =',diag(0,Jc,Jc),'Crank link axes') + lineMatrix('I<sub>G,r</sub> =',diag(0,Jr,Jr),'Rod link axes');
      }
      case 'gyro':return lineMatrix('I<sub>body</sub> =',diag(p.Ip,p.Ip,p.I3),'Rotor principal axes');
      default:return `<div class="tensor-scalar"><span class="tensor-label">Effective planar inertia</span><strong>I<sub>z</sub> = I<sub>p</sub> + mr² = ${f(d.I,3)} kg·m²</strong><small>One rotational degree of freedom about z</small></div>`;
    }
  }

  function updateOutputs(d) {
    const q=equationsFor(mode,d,params[mode]);
    document.getElementById('equations').innerHTML=q.rows.map(([a,b])=>`<div class="equation-row"><span class="equation-symbol">${a}</span><span class="equation-result">${b}</span></div>`).join('');
    document.getElementById('tensor-display').innerHTML=tensorFor(mode,d,params[mode]);
    document.getElementById('math-note').innerHTML=q.note;
    const arr=d.H,range=Math.max(.1,...arr.map(v=>Math.abs(v)));
    document.getElementById('component-list').innerHTML=arr.map((v,i)=>{
      const perc=clamp(50*Math.abs(v)/range,0,50),left=v>=0?50:50-perc;
      return `<div class="component-row"><div class="component-label">H<sub>${['x','y','z'][i]}</sub></div><div class="component-bar-track"><div class="component-center"></div><div class="component-bar" style="background:${colorFor(i)};left:${left}%;width:${perc}%"></div></div><div class="component-value">${v>=0?'+':''}${f(v,3)}</div></div>`;
    }).join('');
    const footer={
      flywheel:`Angular momentum is ${d.H[2]>=0?'out of':'into'} the screen. |H| = ${f(Math.abs(d.H[2]),3)} kg·m²/s.`,
      rolling:`About contact P: H<sub>P,z</sub> = ${f(d.HP,3)} kg·m²/s (${d.H[2]===0?'zero':'three times H about G'}).`,
      slider:`Crank: ${f(d.Hc,3)} · Rod: ${f(d.Hr,3)} · Slider: 0 kg·m²/s.`,
      gyro:`Torque components: [${(d.torque||[0,0,0]).map(v=>f(v,3)).join(', ')}] N·m.`,
      platform:`Radius ratio r/r<sub>0</sub> = ${f(params.platform.r/params.platform.r0,2)}. ω = ${f(d.w,3)} rad/s.`
    }[mode];
    document.getElementById('component-foot').innerHTML=footer;
  }

  function line(x,y,X,Y,color=C.ink,width=3,dash=[]) {ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  function circle(x,y,r,fill,stroke,width=1){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}}
  function text(s,x,y,size=19,color=C.ink,weight=600,align='left'){ctx.font=`${weight} ${size}px ui-sans-serif,Segoe UI,Arial`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(s,x,y);ctx.textAlign='left';}
  function arrow(x,y,X,Y,color=C.teal,width=5,head=14){const a=Math.atan2(Y-y,X-x),c=Math.cos(a),s=Math.sin(a);line(x,y,X,Y,color,width);line(X-head*c+head*.5*s,Y-head*s-head*.5*c,X,Y,color,width);line(X,Y,X-head*c-head*.5*s,Y-head*s+head*.5*c,color,width);}
  function arcArrow(cx,cy,r,a0,a1,color){ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(cx,cy,r,a0,a1,a1<a0);ctx.stroke();const x=cx+r*Math.cos(a1),y=cy+r*Math.sin(a1),tan=a1>a0?a1+Math.PI/2:a1-Math.PI/2;line(x-17*Math.cos(tan-.45),y-17*Math.sin(tan-.45),x,y,color,5);line(x,y,x-17*Math.cos(tan+.45),y-17*Math.sin(tan+.45),color,5);}
  function depthGlyph(x,y,value,label,scale=1){const color=C.gold;circle(x,y,26*scale,'#fffbf3',color,3);if(Math.abs(value)<1e-8)text('0',x,y+1,19*scale,color,800,'center');else if(value>0)circle(x,y,7*scale,color);else{line(x-9*scale,y-9*scale,x+9*scale,y+9*scale,color,3);line(x+9*scale,y-9*scale,x-9*scale,y+9*scale,color,3);}text(label,x+36*scale,y-13*scale,18*scale,color,750);}
  function drawGrid(){ctx.clearRect(0,0,1000,560);ctx.fillStyle=C.paper;ctx.fillRect(0,0,1000,560);ctx.strokeStyle='#edf3f7';ctx.lineWidth=1;for(let x=30;x<1000;x+=44){line(x,0,x,560,'#eff4f7',1)}for(let y=27;y<560;y+=44)line(0,y,1000,y,'#eff4f7',1);text('MODEL VIEW',32,35,13,'#a3b7c3',800);}
  function drawFlywheel(d,p){const cx=390,cy=297,r=clamp(100+p.R*67,106,180);circle(cx,cy,r,'#e4eff6',C.ink,8);circle(cx,cy,r-17,null,'#aecadb',3);for(let i=0;i<6;i++){const a=d.theta+i*TAU/6;line(cx+31*Math.cos(a),cy+31*Math.sin(a),cx+(r-24)*Math.cos(a),cy+(r-24)*Math.sin(a),C.blue,13);}circle(cx,cy,24,'white',C.ink,6);if(showVectors)depthGlyph(cx,cy,d.H[2],'H about G');if(Math.abs(d.w)>1e-4)arcArrow(cx,cy,r+32,2.0,2.0+Math.sign(d.w)*.85,C.teal);text('ω = '+f(d.w,2)+' rad/s',685,218,25,C.teal,800);text('I = '+f(d.I,3)+' kg·m²',685,267,22,C.ink,700);text('H = '+f(d.H[2],3)+' kg·m²/s',685,315,23,C.gold,800);text('Center of mass G',270,515,16,C.muted,600);}
  function drawRolling(d,p){const r=clamp(p.R*220,72,175),base=420,cy=base-r,span=480,cx=275+((p.v*t*105%span)+span)%span;line(75,base,930,base,'#9eb4c4',13);for(let x=93;x<925;x+=36)line(x,base+10,x-16,base+26,'#b6c8d4',2);circle(cx,cy,r,'#d9edf4',C.ink,7);circle(cx,cy,r-15,null,C.blue,3);for(let i=0;i<6;i++){const a=d.theta+i*TAU/6;line(cx+23*Math.cos(a),cy+23*Math.sin(a),cx+(r-16)*Math.cos(a),cy+(r-16)*Math.sin(a),C.blue,10);}circle(cx,cy,23,'#fff',C.ink,5);circle(cx,base,8,C.red);text('P',cx+15,base+29,19,C.red,800);text('G',cx+18,cy-24,18,C.ink,800);if(showVectors){depthGlyph(cx,cy,d.H[2],'H at G',.85);depthGlyph(cx+Math.max(57,r*.63),base-12,d.HP,'H at P',.72);}if(Math.abs(p.v)>.01)arrow(cx,cy-r-34,cx+clamp(p.v*100,-195,195),cy-r-34,C.teal,5);text('v at G = '+f(p.v,2)+' m/s',780,210,20,C.teal,750);text('ω = '+f(d.w,2)+' rad/s',780,249,19,C.ink,650);text('H at P = 3 × H at G',755,332,19,C.gold,800);}
  function drawSlider(d,p){const O=[125,345],k=Math.min(155,680/(p.a+p.b)),P=v=>[O[0]+k*v[0],O[1]-k*v[1]],B=P(d.B),S=P(d.S),G=P(d.G);const ra=p.a*k;
    line(65,365,915,365,'#bbcbd5',12);line(65,302,915,302,'#dae7ed',5);circle(...O,ra,null,'#d8e3eb',2);
    if(showTrace){for(let i=0;i<30;i++){const th=d.theta-i*.08,co=Math.cos(th),si=Math.sin(th),dist=Math.sqrt(p.b*p.b-p.a*p.a*si*si),x=O[0]+(p.a*co+dist)*k;circle(x,335,2,'#a1d2d0');}}
    line(...O,...B,C.blue,24);line(...B,...S,C.teal,23);
    ctx.fillStyle='#e8aa58';ctx.strokeStyle=C.ink;ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(S[0]-29,S[1]-28,58,56,8);ctx.fill();ctx.stroke();
    circle(...O,12,'#fff',C.ink,4);circle(...B,12,'#fff',C.ink,4);circle(...S,8,'#fff',C.ink,3);circle(...G,8,'#fff',C.teal,3);
    text('O',O[0]-23,O[1]+30,18,C.ink,800);text('B',B[0]+12,B[1]-22,18,C.ink,800);text('S',S[0],S[1]+50,18,C.ink,800);
    if(showVectors)depthGlyph(G[0]+15,G[1]-49,d.Hspin,'Rod spin',.65);
    text('Crank: '+f(d.Hc,2),715,180,22,C.blue,750);text('Rod: '+f(d.Hr,2),715,224,22,C.teal,750);text('Total H about O: '+f(d.H[2],2),715,268,21,C.gold,800);text('Slider: 0',715,307,19,C.muted,650);
    text('Crank and rod are modeled as uniform slender links.',87,501,15,C.muted,600);
  }
  function drawGyroscope(d,p){const cx=401,cy=330,scale=171;
    const P=v=>[cx+scale*(.93*v[0]+.5*v[1]),cy+scale*(.27*v[0]-.45*v[1]-.83*v[2])];
    const base=P([0,0,0]),ztip=P([0,0,1.65]);arrow(...base,...ztip,'#9db1c0',3);text('z',ztip[0]+10,ztip[1]-10,18,C.muted,700);
    const n=d.n,phi=d.phi,beta=d.beta,e1=[-Math.sin(phi),Math.cos(phi),0],e2=[-Math.cos(beta)*Math.cos(phi),-Math.cos(beta)*Math.sin(phi),Math.sin(beta)];
    if(showTrace){ctx.strokeStyle='#c8d6df';ctx.lineWidth=2;ctx.setLineDash([7,7]);ctx.beginPath();for(let i=0;i<=100;i++){let a=TAU*i/100,pos=[Math.sin(beta)*Math.cos(a),Math.sin(beta)*Math.sin(a),Math.cos(beta)],q=P(pos);if(i===0)ctx.moveTo(...q);else ctx.lineTo(...q);}ctx.stroke();ctx.setLineDash([]);}
    const tail=P(n.map(x=>x*(-.6))),tip=P(n.map(x=>x*1.45));line(...tail,...tip,C.ink,10);
    ctx.beginPath();for(let i=0;i<=90;i++){const a=TAU*i/90,v=[0,1,2].map(j=>.45*n[j]+.75*Math.cos(a)*e1[j]+.75*Math.sin(a)*e2[j]),q=P(v);if(i===0)ctx.moveTo(...q);else ctx.lineTo(...q);}ctx.fillStyle='rgba(196,225,240,.89)';ctx.fill();ctx.strokeStyle=C.blue;ctx.lineWidth=7;ctx.stroke();
    const rim=[0,1,2].map(j=>.45*n[j]+.65*Math.cos(p.spin*t)*e1[j]+.65*Math.sin(p.spin*t)*e2[j]);line(...P(n.map(x=>.45*x)),...P(rim),C.teal,6);circle(...P(rim),7,C.teal);
    if(showVectors){const hScale=Math.max(.25,magnitude(d.H));let htip=P(d.H.map(x=>x*1.65/hScale));arrow(...base,...htip,C.gold,8);text('H',htip[0]+11,htip[1]-12,25,C.gold,800);const tm=Math.max(.1,magnitude(d.torque)),ttip=P(d.torque.map(x=>x*1.02/tm));arrow(...base,...ttip,C.red,6);text('τ',ttip[0]+10,ttip[1]+8,25,C.red,800);}
    circle(...base,9,C.ink);text('Rotor spin ψ̇',695,180,22,C.teal,750);text('Axis tilt β = '+p.beta+'°',695,223,20,C.ink,650);text('Precession Ω',695,280,21,C.red,750);text('H along x = '+f(d.H[0],2),695,354,18,C.blue,650);text('H along y = '+f(d.H[1],2),695,385,18,C.teal,650);text('H along z = '+f(d.H[2],2),695,416,18,C.gold,750);
  }
  function drawPlatform(d,p){const cx=401,cy=283,R=173,personR=clamp(p.r/1.5*145,20,145),theta=d.theta;
    circle(cx,cy,R,'#edf4f7',C.ink,7);circle(cx,cy,R-17,null,'#cfdee8',2);
    for(let j=0;j<8;j++){const a=TAU*j/8+theta;line(cx+40*Math.cos(a),cy+40*Math.sin(a),cx+(R-20)*Math.cos(a),cy+(R-20)*Math.sin(a),'#b3cbd9',7);}
    if(showTrace){ctx.strokeStyle='#cfb484';ctx.lineWidth=2;ctx.setLineDash([7,6]);ctx.beginPath();ctx.arc(cx,cy,personR,0,TAU);ctx.stroke();ctx.setLineDash([]);}
    const px=cx+personR*Math.cos(theta),py=cy-personR*Math.sin(theta);line(cx,cy,px,py,C.teal,3,[8,6]);circle(px,py,19,'#edaf60',C.ink,4);circle(cx,cy,13,'#fff',C.ink,4);
    if(showVectors)depthGlyph(cx,cy,d.H[2],'Total H',1.1);
    if(Math.abs(d.w)>.01)arcArrow(cx,cy,R+27,2.2,2.2+Math.sign(d.w)*.75,C.teal);
    text('r = '+f(p.r,2)+' m',700,209,24,C.teal,800);text('I = '+f(d.I,3)+' kg·m²',700,257,22,C.ink,700);text('ω = '+f(d.w,2)+' rad/s',700,303,22,C.blue,800);text('H about z = '+f(d.H0,2),700,355,23,C.gold,800);text('kg·m²/s',700,383,16,C.muted,600);
    text('Top view · mass travels on the platform',120,509,16,C.muted,600);
  }

  function updateGraph(){
    const W=650,H=230;hctx.clearRect(0,0,W,H);hctx.fillStyle='#fff';hctx.fillRect(0,0,W,H);const L=53,R=15,T=20,B=31,p=params[mode];
    const series=[[],[],[]];let maxAbs=0;
    for(let i=0;i<=120;i++){const time=duration*i/120,v=compute(mode,time,p).H;for(let j=0;j<3;j++){series[j].push(v[j]);maxAbs=Math.max(maxAbs,Math.abs(v[j]));}}
    maxAbs=Math.max(.1,maxAbs*1.15);
    const px=i=>L+(W-L-R)*i/120,py=v=>T+(H-T-B)*(1-(v+maxAbs)/(2*maxAbs));
    hctx.font='11px Arial';hctx.textAlign='right';hctx.fillStyle='#91a8b6';
    for(let k=-2;k<=2;k++){const y=py(k*maxAbs/2);hctx.strokeStyle=k===0?'#b3c8d5':'#eaf0f4';hctx.lineWidth=k===0?1.5:1;hctx.beginPath();hctx.moveTo(L,y);hctx.lineTo(W-R,y);hctx.stroke();if(k===-2||k===0||k===2)hctx.fillText(f(k*maxAbs/2,2),L-9,y+4);}
    for(let i=0;i<=4;i++){let x=L+(W-L-R)*i/4;hctx.fillStyle='#91a8b6';hctx.textAlign='center';hctx.fillText(f(i*duration/4,0)+'s',x,H-10);}
    for(let j=0;j<3;j++){hctx.strokeStyle=colorFor(j);hctx.lineWidth=2.5;hctx.beginPath();series[j].forEach((v,i)=>i===0?hctx.moveTo(px(i),py(v)):hctx.lineTo(px(i),py(v)));hctx.stroke();}
    const tx=L+(W-L-R)*t/duration;hctx.strokeStyle='#617c90';hctx.lineWidth=1.5;hctx.setLineDash([5,5]);hctx.beginPath();hctx.moveTo(tx,T);hctx.lineTo(tx,H-B);hctx.stroke();hctx.setLineDash([]);
  }

  function drawScene(d){drawGrid();switch(mode){case 'flywheel':drawFlywheel(d,params.flywheel);break;case 'rolling':drawRolling(d,params.rolling);break;case 'slider':drawSlider(d,params.slider);break;case 'gyro':drawGyroscope(d,params.gyro);break;default:drawPlatform(d,params.platform);}text('t = '+f(t,2)+' s',33,533,16,C.muted,700);}
  function updateAll(){const d=compute(mode,t,params[mode]);scrub.value=String(t);document.getElementById('time-readout').textContent=f(t,2)+' s';drawScene(d);updateOutputs(d);if(frameNo++%3===0)updateGraph();}
  function setPlaying(value){playing=value;playBtn.setAttribute('aria-label',playing?'Pause simulation':'Play simulation');document.getElementById('play-icon').textContent=playing?'Ⅱ':'▶';document.getElementById('play-text').textContent=playing?'Pause':'Play';lastFrame=0;}
  function animate(now){if(playing&&lastFrame){const dt=clamp((now-lastFrame)/1000,0,.05);t+=dt*rate;if(t>duration)t%=duration;}lastFrame=now;updateAll();requestAnimationFrame(animate);}

  modeTabs.forEach(b=>b.addEventListener('click',()=>{updateMode(b.dataset.mode)}));
  playBtn.addEventListener('click',()=>setPlaying(!playing));
  document.getElementById('reset-time').addEventListener('click',()=>{t=0;updateAll();});
  document.getElementById('reset-params').addEventListener('click',()=>{params[mode]=JSON.parse(JSON.stringify(original[mode]));t=0;buildInputs();updateAll();});
  scrub.addEventListener('input',()=>{t=Number(scrub.value);setPlaying(false);updateAll();});
  document.getElementById('speed-select').addEventListener('change',e=>rate=Number(e.target.value));
  document.getElementById('show-vectors').addEventListener('change',e=>{showVectors=e.target.checked;updateAll();});
  document.getElementById('show-trace').addEventListener('change',e=>{showTrace=e.target.checked;updateAll();});
  document.getElementById('reveal-btn').addEventListener('click',()=>{revealed=!revealed;document.getElementById('challenge-answer').hidden=!revealed;document.getElementById('reveal-btn').innerHTML=revealed?'Hide explanation <span>↗</span>':'Reveal explanation <span>↗</span>';});
  window.addEventListener('hashchange',()=>{const incoming=location.hash.slice(1);if(modes[incoming]&&incoming!==mode)updateMode(incoming);});
  updateMode(mode);requestAnimationFrame(animate);
})();
