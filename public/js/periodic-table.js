// Interactive periodic table floating tool — 2TF529
(function () {
  'use strict';
  if (window.__periodicTableLoaded) return;
  window.__periodicTableLoaded = true;

  const raw = `
1|H|Hiđro|1|1|nonmetal
2|He|Heli|1|18|noble
3|Li|Liti|2|1|alkali
4|Be|Beri|2|2|alkaline
5|B|Bo|2|13|metalloid
6|C|Carbon|2|14|nonmetal
7|N|Nitơ|2|15|nonmetal
8|O|Oxi|2|16|nonmetal
9|F|Flo|2|17|halogen
10|Ne|Neon|2|18|noble
11|Na|Natri|3|1|alkali
12|Mg|Magie|3|2|alkaline
13|Al|Nhôm|3|13|post
14|Si|Silic|3|14|metalloid
15|P|Photpho|3|15|nonmetal
16|S|Lưu huỳnh|3|16|nonmetal
17|Cl|Clo|3|17|halogen
18|Ar|Argon|3|18|noble
19|K|Kali|4|1|alkali
20|Ca|Canxi|4|2|alkaline
21|Sc|Scandi|4|3|transition
22|Ti|Titan|4|4|transition
23|V|Vanadi|4|5|transition
24|Cr|Crom|4|6|transition
25|Mn|Mangan|4|7|transition
26|Fe|Sắt|4|8|transition
27|Co|Coban|4|9|transition
28|Ni|Niken|4|10|transition
29|Cu|Đồng|4|11|transition
30|Zn|Kẽm|4|12|transition
31|Ga|Gali|4|13|post
32|Ge|Gecmani|4|14|metalloid
33|As|Asen|4|15|metalloid
34|Se|Selen|4|16|nonmetal
35|Br|Brom|4|17|halogen
36|Kr|Krypton|4|18|noble
37|Rb|Rubidi|5|1|alkali
38|Sr|Stronti|5|2|alkaline
39|Y|Ytri|5|3|transition
40|Zr|Zirconi|5|4|transition
41|Nb|Niobi|5|5|transition
42|Mo|Molypden|5|6|transition
43|Tc|Tecneti|5|7|transition
44|Ru|Ruteni|5|8|transition
45|Rh|Rodi|5|9|transition
46|Pd|Paladi|5|10|transition
47|Ag|Bạc|5|11|transition
48|Cd|Cadimi|5|12|transition
49|In|Indi|5|13|post
50|Sn|Thiếc|5|14|post
51|Sb|Antimon|5|15|metalloid
52|Te|Telua|5|16|metalloid
53|I|Iot|5|17|halogen
54|Xe|Xenon|5|18|noble
55|Cs|Xesi|6|1|alkali
56|Ba|Bari|6|2|alkaline
72|Hf|Hafni|6|4|transition
73|Ta|Tantan|6|5|transition
74|W|Vonfram|6|6|transition
75|Re|Reni|6|7|transition
76|Os|Osmi|6|8|transition
77|Ir|Iridi|6|9|transition
78|Pt|Platin|6|10|transition
79|Au|Vàng|6|11|transition
80|Hg|Thủy ngân|6|12|transition
81|Tl|Tali|6|13|post
82|Pb|Chì|6|14|post
83|Bi|Bitmut|6|15|post
84|Po|Poloni|6|16|post
85|At|Astatin|6|17|halogen
86|Rn|Radon|6|18|noble
87|Fr|Franxi|7|1|alkali
88|Ra|Radi|7|2|alkaline
104|Rf|Rutherfordi|7|4|transition
105|Db|Dubni|7|5|transition
106|Sg|Seaborgi|7|6|transition
107|Bh|Bohri|7|7|transition
108|Hs|Hassi|7|8|transition
109|Mt|Meitneri|7|9|transition
110|Ds|Darmstadti|7|10|transition
111|Rg|Roentgeni|7|11|transition
112|Cn|Copernixi|7|12|transition
113|Nh|Nihoni|7|13|post
114|Fl|Flerovi|7|14|post
115|Mc|Moscovi|7|15|post
116|Lv|Livermori|7|16|post
117|Ts|Tennessine|7|17|halogen
118|Og|Oganesson|7|18|noble
57|La|Lantan|8|4|lanthanide
58|Ce|Xeri|8|5|lanthanide
59|Pr|Praseodymi|8|6|lanthanide
60|Nd|Neodymi|8|7|lanthanide
61|Pm|Prometi|8|8|lanthanide
62|Sm|Samari|8|9|lanthanide
63|Eu|Europi|8|10|lanthanide
64|Gd|Gadolini|8|11|lanthanide
65|Tb|Terbi|8|12|lanthanide
66|Dy|Dysprosi|8|13|lanthanide
67|Ho|Holmi|8|14|lanthanide
68|Er|Erbi|8|15|lanthanide
69|Tm|Tuli|8|16|lanthanide
70|Yb|Ytterbi|8|17|lanthanide
71|Lu|Luteti|8|18|lanthanide
89|Ac|Actini|9|4|actinide
90|Th|Thori|9|5|actinide
91|Pa|Protactini|9|6|actinide
92|U|Urani|9|7|actinide
93|Np|Neptuni|9|8|actinide
94|Pu|Plutoni|9|9|actinide
95|Am|Americi|9|10|actinide
96|Cm|Curi|9|11|actinide
97|Bk|Berkeli|9|12|actinide
98|Cf|Californi|9|13|actinide
99|Es|Einsteini|9|14|actinide
100|Fm|Fermi|9|15|actinide
101|Md|Mendelevi|9|16|actinide
102|No|Nobeli|9|17|actinide
103|Lr|Lawrenci|9|18|actinide`;

  const elements = raw.trim().split('\n').map(line => {
    const [number,symbol,name,row,col,category] = line.split('|');
    return { number:+number, symbol, name, row:+row, col:+col, category };
  }).sort((a,b) => a.number-b.number);

  const labels = {
    all:'Tất cả', alkali:'Kim loại kiềm', alkaline:'Kiềm thổ', transition:'Kim loại chuyển tiếp',
    post:'Kim loại hậu chuyển tiếp', metalloid:'Á kim', nonmetal:'Phi kim', halogen:'Halogen',
    noble:'Khí hiếm', lanthanide:'Họ Lantan', actinide:'Họ Actini'
  };

  const masses = `1.008|4.003|6.94|9.012|10.81|12.011|14.007|15.999|18.998|20.180|22.990|24.305|26.982|28.085|30.974|32.06|35.45|39.948|39.098|40.078|44.956|47.867|50.942|51.996|54.938|55.845|58.933|58.693|63.546|65.38|69.723|72.630|74.922|78.971|79.904|83.798|85.468|87.62|88.906|91.224|92.906|95.95|98|101.07|102.91|106.42|107.87|112.41|114.82|118.71|121.76|127.60|126.90|131.29|132.91|137.33|138.91|140.12|140.91|144.24|145|150.36|151.96|157.25|158.93|162.50|164.93|167.26|168.93|173.05|174.97|178.49|180.95|183.84|186.21|190.23|192.22|195.08|196.97|200.59|204.38|207.2|208.98|209|210|222|223|226|227|232.04|231.04|238.03|237|244|243|247|247|251|252|257|258|259|266|267|268|269|270|269|270|278|281|282|285|286|289|290|293|294|294`.split('|');
  elements.forEach(el => { el.mass = masses[el.number-1] || '—'; });

  const en = Object.fromEntries(`H:2.20 Li:0.98 Be:1.57 B:2.04 C:2.55 N:3.04 O:3.44 F:3.98 Na:0.93 Mg:1.31 Al:1.61 Si:1.90 P:2.19 S:2.58 Cl:3.16 K:0.82 Ca:1.00 Sc:1.36 Ti:1.54 V:1.63 Cr:1.66 Mn:1.55 Fe:1.83 Co:1.88 Ni:1.91 Cu:1.90 Zn:1.65 Ga:1.81 Ge:2.01 As:2.18 Se:2.55 Br:2.96 Rb:0.82 Sr:0.95 Y:1.22 Zr:1.33 Nb:1.60 Mo:2.16 Tc:1.90 Ru:2.20 Rh:2.28 Pd:2.20 Ag:1.93 Cd:1.69 In:1.78 Sn:1.96 Sb:2.05 Te:2.10 I:2.66 Cs:0.79 Ba:0.89 La:1.10 Ce:1.12 Pr:1.13 Nd:1.14 Sm:1.17 Eu:1.20 Gd:1.20 Tb:1.10 Dy:1.22 Ho:1.23 Er:1.24 Tm:1.25 Yb:1.10 Lu:1.27 Hf:1.30 Ta:1.50 W:2.36 Re:1.90 Os:2.20 Ir:2.20 Pt:2.28 Au:2.54 Hg:2.00 Tl:1.62 Pb:2.33 Bi:2.02 Po:2.00 At:2.20 Fr:0.70 Ra:0.90 Ac:1.10 Th:1.30 Pa:1.50 U:1.38 Np:1.36 Pu:1.28 Am:1.30`.split(' ').map(x=>x.split(':')));
  const specialOx = {H:'+1, −1',C:'−4, +2, +4',N:'−3, +3, +5',O:'−2',F:'−1',Fe:'+2, +3',Co:'+2, +3',Ni:'+2',Cu:'+1, +2',Zn:'+2',Ag:'+1',Au:'+1, +3',Hg:'+1, +2',Cr:'+2, +3, +6',Mn:'+2, +4, +7'};
  const orbitalOrder = [['1s',2],['2s',2],['2p',6],['3s',2],['3p',6],['4s',2],['3d',10],['4p',6],['5s',2],['4d',10],['5p',6],['6s',2],['4f',14],['5d',10],['6p',6],['7s',2],['5f',14],['6d',10],['7p',6]];
  const configOverrides = {24:'[Ar] 3d⁵ 4s¹',29:'[Ar] 3d¹⁰ 4s¹',41:'[Kr] 4d⁴ 5s¹',42:'[Kr] 4d⁵ 5s¹',44:'[Kr] 4d⁷ 5s¹',45:'[Kr] 4d⁸ 5s¹',46:'[Kr] 4d¹⁰',47:'[Kr] 4d¹⁰ 5s¹',57:'[Xe] 5d¹ 6s²',58:'[Xe] 4f¹ 5d¹ 6s²',64:'[Xe] 4f⁷ 5d¹ 6s²',78:'[Xe] 4f¹⁴ 5d⁹ 6s¹',79:'[Xe] 4f¹⁴ 5d¹⁰ 6s¹',89:'[Rn] 6d¹ 7s²',90:'[Rn] 6d² 7s²',91:'[Rn] 5f² 6d¹ 7s²',92:'[Rn] 5f³ 6d¹ 7s²'};
  const superscript = value => String(value).replace(/\d/g,d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
  function electronConfig(z) {
    if (configOverrides[z]) return configOverrides[z];
    const fill = total => { let left=total; const map={}; for(const [orb,cap] of orbitalOrder){ if(left<=0) break; map[orb]=Math.min(left,cap); left-=map[orb]; } return map; };
    const nobles = [[86,'Rn'],[54,'Xe'],[36,'Kr'],[18,'Ar'],[10,'Ne'],[2,'He']];
    const core = nobles.find(([n])=>n<z) || [0,''];
    const full = fill(z), base = fill(core[0]);
    const rest = Object.entries(full).filter(([orb,count])=>count>(base[orb]||0)).map(([orb,count])=>[orb,count-(base[orb]||0)]).sort((a,b)=>+(a[0][0])-+(b[0][0]) || 'spdf'.indexOf(a[0][1])-'spdf'.indexOf(b[0][1]));
    return `${core[0]?`[${core[1]}] `:''}${rest.map(([orb,count])=>orb+superscript(count)).join(' ')}`;
  }
  function oxidation(el) {
    if (specialOx[el.symbol]) return specialOx[el.symbol];
    if (el.category==='noble') return '0';
    if (el.col===1) return '+1'; if (el.col===2) return '+2';
    if (el.col===13) return '+3'; if (el.col===14) return '−4, +4';
    if (el.col===15) return '−3, +3, +5'; if (el.col===16) return '−2, +4, +6';
    if (el.col===17) return '−1, +1, +3, +5, +7';
    return 'Nhiều mức';
  }
  function blockOf(el) { return el.category==='lanthanide'||el.category==='actinide' ? 'Khối f' : el.category==='transition' ? 'Khối d' : (el.col<=2||el.symbol==='He') ? 'Khối s' : 'Khối p'; }

  const massBySymbol = new Map(elements.map(el=>[el.symbol,Number(el.mass)]));
  const subscriptDigits = {'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9'};
  function calculateFormula(input) {
    const formula = String(input||'').trim().replace(/[₀-₉]/g,ch=>subscriptDigits[ch]).replace(/\s+/g,'');
    if (!formula) throw new Error('Hãy nhập công thức hóa học.');
    const totals = new Map();
    const add = (target,source,multiplier=1) => source.forEach((count,symbol)=>target.set(symbol,(target.get(symbol)||0)+count*multiplier));
    const numberAt = (text,state) => {
      const start=state.i;
      while (/\d/.test(text[state.i]||'')) state.i++;
      if (start===state.i) return 1;
      const value=Number(text.slice(start,state.i));
      if (!Number.isSafeInteger(value)||value<1) throw new Error('Chỉ số nguyên tử phải là số nguyên dương.');
      return value;
    };
    const parseSequence = (text,state,closing='') => {
      const counts=new Map();
      const pairs={'(':')','[':']','{':'}'};
      while (state.i<text.length) {
        const ch=text[state.i];
        if (closing && ch===closing) { state.i++; return counts; }
        if (')]}'.includes(ch)) throw new Error('Dấu ngoặc trong công thức chưa đúng.');
        if (pairs[ch]) {
          state.i++;
          const nested=parseSequence(text,state,pairs[ch]);
          add(counts,nested,numberAt(text,state));
          continue;
        }
        if (!/[A-Z]/.test(ch)) throw new Error(`Không nhận diện được ký tự “${ch}”.`);
        let symbol=ch; state.i++;
        if (/[a-z]/.test(text[state.i]||'')) symbol+=text[state.i++];
        if (!massBySymbol.has(symbol)) throw new Error(`Không tìm thấy nguyên tố ${symbol}.`);
        counts.set(symbol,(counts.get(symbol)||0)+numberAt(text,state));
      }
      if (closing) throw new Error('Công thức đang thiếu dấu ngoặc đóng.');
      return counts;
    };
    const parts=formula.split(/[·.]/);
    if (parts.some(part=>!part)) throw new Error('Phần chất ngậm nước chưa đầy đủ.');
    parts.forEach(part=>{
      const state={i:0};
      let coefficient=1;
      const leading=part.match(/^\d+(?=[A-Z([{])/);
      if (leading) { coefficient=Number(leading[0]); state.i=leading[0].length; }
      const counts=parseSequence(part,state);
      if (!counts.size||state.i!==part.length) throw new Error('Công thức hóa học chưa hợp lệ.');
      add(totals,counts,coefficient);
    });
    const contributions=[...totals].map(([symbol,count])=>({symbol,count,mass:massBySymbol.get(symbol)*count}));
    const total=contributions.reduce((sum,item)=>sum+item.mass,0);
    return {formula,total,contributions};
  }

  const style = document.createElement('style');
  style.textContent = `
    .pt-floating-btn{position:fixed;right:18px;bottom:132px;z-index:998;border:1px solid rgba(148,163,184,.42);background:#152033;color:#f8fafc;border-radius:999px;padding:10px 14px;display:flex;align-items:center;gap:8px;font:700 13px/1.1 system-ui,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.28);cursor:pointer;transition:.18s}
    .pt-floating-btn:hover{transform:translateY(-2px);background:#1d4ed8;border-color:#60a5fa}
    .pt-overlay{position:fixed;inset:0;z-index:1200;background:rgba(2,6,23,.72);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:18px}
    .pt-overlay.open{display:flex}
    .pt-dialog{width:min(1510px,98vw);max-height:94vh;overflow:hidden;background:var(--surface,#0b1220);color:var(--text,#eef2ff);border:1px solid var(--border,rgba(148,163,184,.35));border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);display:flex;flex-direction:column}
    .pt-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 18px;border-bottom:1px solid var(--border,rgba(148,163,184,.25))}
    .pt-title{font:900 18px/1.2 system-ui,sans-serif}.pt-sub{color:var(--muted,var(--text2,#94a3b8));font:500 11px/1.4 system-ui,sans-serif;margin-top:3px}
    .pt-close{width:36px;height:36px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.3));background:var(--surface2,#172033);color:var(--text,#fff);font-size:20px;cursor:pointer}
    .pt-tools{padding:12px 18px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border,rgba(148,163,184,.25))}
    .pt-search{min-width:220px;flex:1;padding:9px 12px;border-radius:10px;border:1px solid var(--border,rgba(148,163,184,.35));background:var(--surface2,#101827);color:var(--text,#fff);outline:none}
    .pt-chip{border:1px solid var(--border,rgba(148,163,184,.38));background:transparent;color:var(--text2,#cbd5e1);border-radius:999px;padding:7px 10px;font:700 11px/1 system-ui,sans-serif;cursor:pointer}
    .pt-chip.active{background:#2563eb;border-color:#60a5fa;color:#fff}
    .pt-scroll{overflow:auto;padding:18px}
    .pt-layout{display:grid;grid-template-columns:minmax(1000px,1fr) 280px;gap:16px;min-width:1296px;align-items:start}
    .pt-grid{display:grid;grid-template-columns:repeat(18,minmax(48px,1fr));grid-template-rows:repeat(9,66px);gap:4px;min-width:1000px;border:1px solid var(--border,rgba(148,163,184,.3));border-radius:15px;padding:14px;background:color-mix(in srgb,var(--surface,#08101f) 92%,#2563eb 8%)}
    .pt-cell{position:relative;border:1px solid currentColor;border-radius:7px;padding:5px;background:color-mix(in srgb,currentColor 13%,var(--surface,#08101f));color:#cbd5e1;cursor:pointer;transition:opacity .15s,transform .15s,filter .15s}
    .pt-cell:hover,.pt-cell.selected{transform:scale(1.08);z-index:2;filter:brightness(1.25);box-shadow:0 6px 18px rgba(0,0,0,.3)}
    .pt-cell.dim{opacity:.12;filter:grayscale(1)}.pt-cell.match{box-shadow:0 0 0 3px #fff;z-index:2}
    .pt-no{font:700 9px/1 system-ui,sans-serif;opacity:.88}.pt-symbol{text-align:center;font:900 20px/1.15 system-ui,sans-serif;margin-top:4px}.pt-name{text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:600 8px/1.2 system-ui,sans-serif;margin-top:4px}
    .pt-sample{grid-column:5/13;grid-row:1/3;align-self:center;justify-self:center;display:grid;grid-template-columns:auto 78px auto;grid-template-rows:repeat(3,26px);align-items:center;gap:2px 12px;color:#60a5fa;font:700 11px/1 system-ui,sans-serif;pointer-events:none}
    .pt-sample .sl{text-align:right}.pt-sample .sr{text-align:left}.pt-sample .arrow{font-size:16px}.pt-sample-card{grid-column:2;grid-row:1/4;width:78px;height:86px;border:1px solid #9f5f93;border-radius:8px;background:#40203e;color:#f9a8d4;padding:7px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:14px 1fr 14px;box-shadow:0 5px 16px rgba(0,0,0,.18)}
    .pt-sample-card small{font-size:9px;font-weight:800}.pt-sample-card small:last-of-type{text-align:right}.pt-sample-card b{grid-column:1/3;text-align:center;font-size:24px;align-self:center}.pt-sample-card em{grid-column:1/3;text-align:center;font-style:normal;font-size:9px}
    .pt-info{border:1px solid var(--border,rgba(148,163,184,.35));border-radius:15px;padding:14px;background:var(--surface,#08101f);position:sticky;top:0}
    .pt-info-hero{border:1px solid color-mix(in srgb,var(--pt-accent,#facc15) 35%,transparent);border-radius:12px;padding:12px;background:color-mix(in srgb,var(--pt-accent,#facc15) 12%,var(--surface2,#171a24));color:var(--pt-accent,#facc15);min-height:130px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto 1fr auto}
    .pt-info-hero small{font:800 11px/1 system-ui,sans-serif}.pt-info-hero small:nth-child(2){text-align:right}.pt-info-symbol{grid-column:1/3;text-align:center;align-self:end;font:900 52px/1 system-ui,sans-serif}.pt-info-name{grid-column:1/3;text-align:center;text-transform:uppercase;font:900 15px/1.2 system-ui,sans-serif;margin-top:5px}
    .pt-info-rows{display:flex;flex-direction:column;gap:7px;margin-top:12px}.pt-info-row{display:grid;grid-template-columns:105px minmax(0,1fr);gap:8px;border:1px solid var(--border,rgba(148,163,184,.35));border-radius:9px;padding:9px 10px;color:#93c5fd;font:600 11px/1.3 system-ui,sans-serif}.pt-info-row b{text-align:right;color:var(--text,#fff);overflow-wrap:anywhere}.pt-info-row.oxidation b{color:#fb7185}
    .pt-mass-calc{margin-top:14px;padding-top:14px;border-top:1px solid var(--border,rgba(148,163,184,.3))}.pt-mass-title{font:850 12px/1.3 system-ui,sans-serif;color:var(--text,#fff);margin-bottom:9px}.pt-mass-form{display:grid;grid-template-columns:minmax(0,1fr) 40px;gap:7px}.pt-mass-input{min-width:0;height:40px;border:1px solid var(--border,rgba(148,163,184,.4));border-radius:9px;background:var(--surface2,#101827);color:var(--text,#fff);padding:0 11px;font:700 12px/1 system-ui,sans-serif;outline:none}.pt-mass-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.14)}.pt-mass-submit{border:0;border-radius:9px;background:#3b82f6;color:#fff;font-size:21px;cursor:pointer}.pt-mass-submit:hover{background:#2563eb}.pt-mass-result{margin-top:9px;border:1px solid rgba(20,184,166,.42);border-radius:10px;background:rgba(13,148,136,.10);padding:11px;color:var(--text2,#cbd5e1);font:600 10px/1.55 system-ui,sans-serif}.pt-mass-result[hidden]{display:none}.pt-mass-total{color:#2dd4bf;font-size:13px;font-weight:900;text-align:center}.pt-mass-parts{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.pt-mass-part{border-radius:999px;background:color-mix(in srgb,#14b8a6 14%,var(--surface,#08101f));padding:4px 7px;color:var(--text,#fff);font-weight:750}.pt-mass-result.error{border-color:rgba(248,113,113,.55);background:rgba(239,68,68,.10);color:#f87171}
    .pt-cell[data-cat=alkali]{color:#34d399}.pt-cell[data-cat=alkaline]{color:#84cc16}.pt-cell[data-cat=transition]{color:#facc15}.pt-cell[data-cat=post]{color:#fb7185}.pt-cell[data-cat=metalloid]{color:#f472b6}.pt-cell[data-cat=nonmetal]{color:#38bdf8}.pt-cell[data-cat=halogen]{color:#a78bfa}.pt-cell[data-cat=noble]{color:#c084fc}.pt-cell[data-cat=lanthanide]{color:#818cf8}.pt-cell[data-cat=actinide]{color:#e879f9}
    html[data-theme=light] .pt-floating-btn{background:#fff;color:#172033;border-color:#cbd5e1}.pt-dialog{color-scheme:dark}html[data-theme=light] .pt-dialog{color-scheme:light}
    @media(max-width:850px){.pt-floating-btn{right:12px;bottom:120px;padding:10px}.pt-floating-btn span:last-child{display:none}html.member-mode .wb-floating-btn{bottom:74px!important}html.member-mode .calc-floating-btn{bottom:126px!important}html.member-mode .pt-floating-btn{bottom:178px!important}.pt-grid{grid-template-columns:repeat(18,46px);grid-template-rows:repeat(9,60px)}.pt-layout{grid-template-columns:970px 260px;min-width:1246px}.pt-scroll{padding:10px}.pt-tools{padding:10px}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pt-floating-btn';
  button.setAttribute('aria-label','Mở bảng tuần hoàn');
  button.title = 'Bảng tuần hoàn (Alt+P)';
  button.innerHTML = '<span>⚛️</span><span>Bảng tuần hoàn</span>';

  const overlay = document.createElement('div');
  overlay.className = 'pt-overlay';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML = `<section class="pt-dialog" role="dialog" aria-modal="true" aria-label="Bảng tuần hoàn các nguyên tố hóa học">
    <header class="pt-head"><div><div class="pt-title">⚛️ Bảng tuần hoàn các nguyên tố</div><div class="pt-sub">Chọn nguyên tố để xem thông tin · Lọc theo nhóm hoặc tìm bằng tên, ký hiệu, số hiệu</div></div><button class="pt-close" type="button" aria-label="Đóng">×</button></header>
    <div class="pt-tools"><input class="pt-search" type="search" placeholder="Tìm: Oxi, Fe, 26..." aria-label="Tìm nguyên tố"><div class="pt-filters"></div></div>
    <div class="pt-scroll"><div class="pt-layout">
      <div class="pt-grid"></div>
      <aside class="pt-info" aria-live="polite">
        <div class="pt-info-hero"><small id="pt-info-number">47</small><small id="pt-info-mass">107.87</small><div class="pt-info-symbol" id="pt-info-symbol">Ag</div><div class="pt-info-name" id="pt-info-name">Bạc</div></div>
        <div class="pt-info-rows">
          <div class="pt-info-row"><span>Cấu hình e</span><b id="pt-info-config">[Kr] 4d¹⁰ 5s¹</b></div>
          <div class="pt-info-row"><span>Độ âm điện</span><b id="pt-info-en">1.93</b></div>
          <div class="pt-info-row oxidation"><span>Số oxi hóa</span><b id="pt-info-ox">+1</b></div>
          <div class="pt-info-row"><span>Khối nguyên tố</span><b id="pt-info-block">Khối d</b></div>
          <div class="pt-info-row"><span>Phân loại</span><b id="pt-info-category">Kim loại chuyển tiếp</b></div>
        </div>
        <div class="pt-mass-calc">
          <div class="pt-mass-title">🧮 Máy tính phân tử khối &amp; %m</div>
          <form class="pt-mass-form">
            <input class="pt-mass-input" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="VD: H2SO4, CaCO3…" aria-label="Công thức hóa học">
            <button class="pt-mass-submit" type="submit" aria-label="Tính phân tử khối">→</button>
          </form>
          <div class="pt-mass-result" aria-live="polite" hidden></div>
        </div>
      </aside>
    </div></div>
  </section>`;

  function init() {
    document.body.append(button,overlay);
    const grid = overlay.querySelector('.pt-grid');
    const filters = overlay.querySelector('.pt-filters');
    const info = overlay.querySelector('.pt-info');
    const search = overlay.querySelector('.pt-search');
    const massForm = overlay.querySelector('.pt-mass-form');
    const massInput = overlay.querySelector('.pt-mass-input');
    const massResult = overlay.querySelector('.pt-mass-result');
    let active = 'all';
    const categoryColors = {alkali:'#34d399',alkaline:'#84cc16',transition:'#facc15',post:'#fb7185',metalloid:'#f472b6',nonmetal:'#38bdf8',halogen:'#a78bfa',noble:'#c084fc',lanthanide:'#818cf8',actinide:'#e879f9'};

    Object.entries(labels).forEach(([key,label]) => {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'pt-chip'+(key==='all'?' active':'');
      chip.dataset.filter = key; chip.textContent = label;
      filters.appendChild(chip);
    });

    const sample = document.createElement('div');
    sample.className = 'pt-sample';
    sample.innerHTML = `<span class="sl">Số hiệu nguyên tử →</span><span class="pt-sample-card"><small>13</small><small>26,98</small><b>Al</b><em>Nhôm</em></span><span class="sr">← Nguyên tử khối</span><span class="sl">Ký hiệu hóa học →</span><span class="sr"></span><span class="sl">Tên nguyên tố →</span><span class="sr"></span>`;
    grid.appendChild(sample);

    function selectElement(el,cell) {
      grid.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));
      if (cell) cell.classList.add('selected');
      info.style.setProperty('--pt-accent',categoryColors[el.category]||'#60a5fa');
      overlay.querySelector('#pt-info-number').textContent = el.number;
      overlay.querySelector('#pt-info-mass').textContent = String(el.mass).replace('.',',');
      overlay.querySelector('#pt-info-symbol').textContent = el.symbol;
      overlay.querySelector('#pt-info-name').textContent = el.name;
      overlay.querySelector('#pt-info-config').textContent = electronConfig(el.number);
      overlay.querySelector('#pt-info-en').textContent = en[el.symbol] ? en[el.symbol].replace('.',',') : '—';
      overlay.querySelector('#pt-info-ox').textContent = oxidation(el);
      overlay.querySelector('#pt-info-block').textContent = blockOf(el);
      overlay.querySelector('#pt-info-category').textContent = labels[el.category];
    }

    elements.forEach(el => {
      const cell = document.createElement('button');
      cell.type = 'button'; cell.className = 'pt-cell'; cell.dataset.cat = el.category;
      cell.dataset.number = String(el.number);
      cell.dataset.search = `${el.number} ${el.symbol} ${el.name}`.toLocaleLowerCase('vi');
      cell.style.gridRow = String(el.row); cell.style.gridColumn = String(el.col);
      cell.title = `${el.number}. ${el.name} (${el.symbol})`;
      cell.innerHTML = `<span class="pt-no">${el.number}</span><div class="pt-symbol">${el.symbol}</div><div class="pt-name">${el.name}</div>`;
      cell.addEventListener('click', () => selectElement(el,cell));
      grid.appendChild(cell);
    });
    const silver = elements.find(el=>el.symbol==='Ag');
    selectElement(silver,grid.querySelector('[data-number="47"]'));

    function applyFilter() {
      const q = search.value.trim().toLocaleLowerCase('vi');
      grid.querySelectorAll('.pt-cell').forEach(cell => {
        const categoryMatch = active==='all' || cell.dataset.cat===active;
        const searchMatch = !q || cell.dataset.search.includes(q);
        cell.classList.toggle('dim',!categoryMatch || !searchMatch);
        cell.classList.toggle('match',!!q && searchMatch);
      });
    }
    filters.addEventListener('click', event => {
      const chip = event.target.closest('.pt-chip'); if (!chip) return;
      active = chip.dataset.filter;
      filters.querySelectorAll('.pt-chip').forEach(x=>x.classList.toggle('active',x===chip));
      applyFilter();
    });
    search.addEventListener('input',applyFilter);
    massForm.addEventListener('submit',event=>{
      event.preventDefault();
      try {
        const result=calculateFormula(massInput.value);
        const format=value=>value.toLocaleString('vi-VN',{minimumFractionDigits:0,maximumFractionDigits:2});
        const parts=result.contributions.map(item=>`<span class="pt-mass-part">${item.symbol}: ${format(item.mass/result.total*100)}%</span>`).join('');
        massResult.className='pt-mass-result';
        massResult.innerHTML=`<div class="pt-mass-total">Phân tử khối: ${format(result.total)} g/mol</div><div class="pt-mass-parts">${parts}</div>`;
        massResult.hidden=false;
      } catch (error) {
        massResult.className='pt-mass-result error';
        massResult.textContent=error.message;
        massResult.hidden=false;
      }
    });
  }

  function open() { overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); setTimeout(()=>overlay.querySelector('.pt-search').focus(),30); }
  function close() { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden','true'); button.focus(); }
  button.addEventListener('click',open);
  overlay.querySelector('.pt-close').addEventListener('click',close);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) close(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&overlay.classList.contains('open')) close(); if(e.altKey&&e.key.toLowerCase()==='p'){e.preventDefault();overlay.classList.contains('open')?close():open();} });
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
