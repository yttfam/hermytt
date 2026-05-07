"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/marked/lib/marked.esm.js
  function z() {
    return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
  }
  var T = z();
  function G(l3) {
    T = l3;
  }
  var _ = { exec: () => null };
  function d(l3, e = "") {
    let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
      let i = typeof r == "string" ? r : r.source;
      return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
    }, getRegex: () => new RegExp(t, e) };
    return n;
  }
  var Re = ((l3 = "") => {
    try {
      return !!new RegExp("(?<=1)(?<!1)" + l3);
    } catch {
      return false;
    }
  })();
  var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}#`), htmlBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}<(?:[a-z].*>|!--)`, "i"), blockquoteBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}>`) };
  var Te = /^(?:[ \t]*(?:\n|$))+/;
  var Oe = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
  var we = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
  var I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
  var ye = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
  var Q = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
  var ie = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
  var oe = d(ie).replace(/bull/g, Q).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
  var Pe = d(ie).replace(/bull/g, Q).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
  var j = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
  var Se = /^[^\n]+/;
  var F = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
  var $e = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", F).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
  var Le = d(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, Q).getRegex();
  var v = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
  var _e = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
  var ae = d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
  var Me = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ae).getRegex();
  var K = { blockquote: Me, code: Oe, def: $e, fences: we, heading: ye, hr: I, html: _e, lheading: oe, list: Le, newline: Te, paragraph: ae, table: _, text: Se };
  var re = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
  var ze = { ...K, lheading: Pe, table: re, paragraph: d(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", re).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex() };
  var Ee = { ...K, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(j).replace("hr", I).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", oe).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
  var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
  var Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
  var le = /^( {2,}|\\)\n(?!\s*$)/;
  var Ie = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
  var E = /[\p{P}\p{S}]/u;
  var H = /[\s\p{P}\p{S}]/u;
  var W = /[^\s\p{P}\p{S}]/u;
  var Be = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, H).getRegex();
  var ue = /(?!~)[\p{P}\p{S}]/u;
  var De = /(?!~)[\s\p{P}\p{S}]/u;
  var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
  var ve = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Re ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
  var pe = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
  var He = d(pe, "u").replace(/punct/g, E).getRegex();
  var Ze = d(pe, "u").replace(/punct/g, ue).getRegex();
  var ce = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
  var Ge = d(ce, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, E).getRegex();
  var Ne = d(ce, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, De).replace(/punct/g, ue).getRegex();
  var Qe = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, E).getRegex();
  var je = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, E).getRegex();
  var Fe = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
  var Ue = d(Fe, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, E).getRegex();
  var Ke = d(/\\(punct)/, "gu").replace(/punct/g, E).getRegex();
  var We = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
  var Xe = d(U).replace("(?:-->|$)", "-->").getRegex();
  var Je = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Xe).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
  var q = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
  var Ve = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", q).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
  var he = d(/^!?\[(label)\]\[(ref)\]/).replace("label", q).replace("ref", F).getRegex();
  var ke = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", F).getRegex();
  var Ye = d("reflink|nolink(?!\\()", "g").replace("reflink", he).replace("nolink", ke).getRegex();
  var se = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
  var X = { _backpedal: _, anyPunctuation: Ke, autolink: We, blockSkip: ve, br: le, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: He, emStrongRDelimAst: Ge, emStrongRDelimUnd: Qe, escape: Ae, link: Ve, nolink: ke, punctuation: Be, reflink: he, reflinkSearch: Ye, tag: Je, text: Ie, url: _ };
  var et = { ...X, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", q).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q).getRegex() };
  var N = { ...X, emStrongRDelimAst: Ne, emStrongLDelim: Ze, delLDelim: je, delRDelim: Ue, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", se).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", se).getRegex() };
  var tt = { ...N, br: d(le).replace("{2,}", "*").getRegex(), text: d(N.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
  var B = { normal: K, gfm: ze, pedantic: Ee };
  var A = { normal: X, gfm: N, breaks: tt, pedantic: et };
  var nt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var de = (l3) => nt[l3];
  function O(l3, e) {
    if (e) {
      if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, de);
    } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, de);
    return l3;
  }
  function J(l3) {
    try {
      l3 = encodeURI(l3).replace(m.percentDecode, "%");
    } catch {
      return null;
    }
    return l3;
  }
  function V(l3, e) {
    let t = l3.replace(m.findPipe, (r, i, o) => {
      let u = false, a = i;
      for (; --a >= 0 && o[a] === "\\"; ) u = !u;
      return u ? "|" : " |";
    }), n = t.split(m.splitPipe), s = 0;
    if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
    else for (; n.length < e; ) n.push("");
    for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
    return n;
  }
  function $(l3, e, t) {
    let n = l3.length;
    if (n === 0) return "";
    let s = 0;
    for (; s < n; ) {
      let r = l3.charAt(n - s - 1);
      if (r === e && !t) s++;
      else if (r !== e && t) s++;
      else break;
    }
    return l3.slice(0, n - s);
  }
  function Y(l3) {
    let e = l3.split(`
`), t = e.length - 1;
    for (; t >= 0 && m.blankLine.test(e[t]); ) t--;
    return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
  }
  function ge(l3, e) {
    if (l3.indexOf(e[1]) === -1) return -1;
    let t = 0;
    for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
    else if (l3[n] === e[0]) t++;
    else if (l3[n] === e[1] && (t--, t < 0)) return n;
    return t > 0 ? -2 : -1;
  }
  function fe(l3, e = 0) {
    let t = e, n = "";
    for (let s of l3) if (s === "	") {
      let r = 4 - t % 4;
      n += " ".repeat(r), t += r;
    } else n += s, t++;
    return n;
  }
  function me(l3, e, t, n, s) {
    let r = e.href, i = e.title || null, o = l3[1].replace(s.other.outputLinkReplace, "$1");
    n.state.inLink = true;
    let u = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) };
    return n.state.inLink = false, u;
  }
  function rt(l3, e, t) {
    let n = l3.match(t.other.indentCodeCompensation);
    if (n === null) return e;
    let s = n[1];
    return e.split(`
`).map((r) => {
      let i = r.match(t.other.beginningSpace);
      if (i === null) return r;
      let [o] = i;
      return o.length >= s.length ? r.slice(s.length) : r;
    }).join(`
`);
  }
  var w = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "rules");
      __publicField(this, "lexer");
      this.options = e || T;
    }
    space(e) {
      let t = this.rules.block.newline.exec(e);
      if (t && t[0].length > 0) return { type: "space", raw: t[0] };
    }
    code(e) {
      let t = this.rules.block.code.exec(e);
      if (t) {
        let n = this.options.pedantic ? t[0] : Y(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
        return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
      }
    }
    fences(e) {
      let t = this.rules.block.fences.exec(e);
      if (t) {
        let n = t[0], s = rt(n, t[3] || "", this.rules);
        return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
      }
    }
    heading(e) {
      let t = this.rules.block.heading.exec(e);
      if (t) {
        let n = t[2].trim();
        if (this.rules.other.endingHash.test(n)) {
          let s = $(n, "#");
          (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
        }
        return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
      }
    }
    hr(e) {
      let t = this.rules.block.hr.exec(e);
      if (t) return { type: "hr", raw: $(t[0], `
`) };
    }
    blockquote(e) {
      let t = this.rules.block.blockquote.exec(e);
      if (t) {
        let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
        for (; n.length > 0; ) {
          let o = false, u = [], a;
          for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), o = true;
          else if (!o) u.push(n[a]);
          else break;
          n = n.slice(a);
          let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
          s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
          let k = this.lexer.state.top;
          if (this.lexer.state.top = true, this.lexer.blockTokens(p, i, true), this.lexer.state.top = k, n.length === 0) break;
          let h = i.at(-1);
          if (h?.type === "code") break;
          if (h?.type === "blockquote") {
            let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
            i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
            break;
          } else if (h?.type === "list") {
            let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
            i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
            continue;
          }
        }
        return { type: "blockquote", raw: s, tokens: i, text: r };
      }
    }
    list(e) {
      let t = this.rules.block.list.exec(e);
      if (t) {
        let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
        n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
        let i = this.rules.other.listItemRegex(n), o = false;
        for (; e; ) {
          let a = false, c = "", p = "";
          if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
          c = t[0], e = e.substring(c.length);
          let k = fe(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
          if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
            let S = this.rules.other.nextBulletRegex(f), ee = this.rules.other.hrRegex(f), te = this.rules.other.fencesBeginRegex(f), ne = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f), be = this.rules.other.blockquoteBeginRegex(f);
            for (; e; ) {
              let Z = e.split(`
`, 1)[0], C;
              if (h = Z, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), te.test(h) || ne.test(h) || xe.test(h) || be.test(h) || S.test(h) || ee.test(h)) break;
              if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) p += `
` + C.slice(f);
              else {
                if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || te.test(k) || ne.test(k) || ee.test(k)) break;
                p += `
` + h;
              }
              R = !h.trim(), c += Z + `
`, e = e.substring(Z.length + 1), k = C.slice(f);
            }
          }
          r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
        }
        let u = r.items.at(-1);
        if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
        else return;
        r.raw = r.raw.trimEnd();
        for (let a of r.items) {
          this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []);
          let c = a.tokens[0];
          if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
            a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
            for (let k = this.lexer.inlineQueue.length - 1; k >= 0; k--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
              this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
              break;
            }
            let p = this.rules.other.listTaskCheckbox.exec(a.raw);
            if (p) {
              let k = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
              a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({ type: "paragraph", raw: k.raw, text: k.raw, tokens: [k] }) : a.tokens.unshift(k);
            }
          } else a.task && (a.task = false);
          if (!r.loose) {
            let p = a.tokens.filter((h) => h.type === "space"), k = p.length > 0 && p.some((h) => this.rules.other.anyLine.test(h.raw));
            r.loose = k;
          }
        }
        if (r.loose) for (let a of r.items) {
          a.loose = true;
          for (let c of a.tokens) c.type === "text" && (c.type = "paragraph");
        }
        return r;
      }
    }
    html(e) {
      let t = this.rules.block.html.exec(e);
      if (t) {
        let n = Y(t[0]);
        return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
      }
    }
    def(e) {
      let t = this.rules.block.def.exec(e);
      if (t) {
        let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
        return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
      }
    }
    table(e) {
      let t = this.rules.block.table.exec(e);
      if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
      let n = V(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
      if (n.length === s.length) {
        for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
        for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
        for (let o of r) i.rows.push(V(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
        return i;
      }
    }
    lheading(e) {
      let t = this.rules.block.lheading.exec(e);
      if (t) {
        let n = t[1].trim();
        return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
      }
    }
    paragraph(e) {
      let t = this.rules.block.paragraph.exec(e);
      if (t) {
        let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
        return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
      }
    }
    text(e) {
      let t = this.rules.block.text.exec(e);
      if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
    }
    escape(e) {
      let t = this.rules.inline.escape.exec(e);
      if (t) return { type: "escape", raw: t[0], text: t[1] };
    }
    tag(e) {
      let t = this.rules.inline.tag.exec(e);
      if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
    }
    link(e) {
      let t = this.rules.inline.link.exec(e);
      if (t) {
        let n = t[2].trim();
        if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
          if (!this.rules.other.endAngleBracket.test(n)) return;
          let i = $(n.slice(0, -1), "\\");
          if ((n.length - i.length) % 2 === 0) return;
        } else {
          let i = ge(t[2], "()");
          if (i === -2) return;
          if (i > -1) {
            let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
            t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
          }
        }
        let s = t[2], r = "";
        if (this.options.pedantic) {
          let i = this.rules.other.pedanticHrefTitle.exec(s);
          i && (s = i[1], r = i[3]);
        } else r = t[3] ? t[3].slice(1, -1) : "";
        return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), me(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
      }
    }
    reflink(e, t) {
      let n;
      if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
        let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
        if (!r) {
          let i = n[0].charAt(0);
          return { type: "text", raw: i, text: i };
        }
        return me(n, r, n[0], this.lexer, this.rules);
      }
    }
    emStrong(e, t, n = "") {
      let s = this.rules.inline.emStrongLDelim.exec(e);
      if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
      if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
        for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null; ) {
          if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
          if (u = [...o].length, s[3] || s[4]) {
            a += u;
            continue;
          } else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
            c += u;
            continue;
          }
          if (a -= u, a > 0) continue;
          u = Math.min(u, u + a + c);
          let k = [...s[0]][0].length, h = e.slice(0, i + s.index + k + u);
          if (Math.min(i, u) % 2) {
            let f = h.slice(1, -1);
            return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
          }
          let R = h.slice(2, -2);
          return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
        }
      }
    }
    codespan(e) {
      let t = this.rules.inline.code.exec(e);
      if (t) {
        let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
        return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
      }
    }
    br(e) {
      let t = this.rules.inline.br.exec(e);
      if (t) return { type: "br", raw: t[0] };
    }
    del(e, t, n = "") {
      let s = this.rules.inline.delLDelim.exec(e);
      if (!s) return;
      if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
        for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null; ) {
          if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i)) continue;
          if (s[3] || s[4]) {
            a += u;
            continue;
          }
          if (a -= u, a > 0) continue;
          u = Math.min(u, u + a);
          let p = [...s[0]][0].length, k = e.slice(0, i + s.index + p + u), h = k.slice(i, -i);
          return { type: "del", raw: k, text: h, tokens: this.lexer.inlineTokens(h) };
        }
      }
    }
    autolink(e) {
      let t = this.rules.inline.autolink.exec(e);
      if (t) {
        let n, s;
        return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
      }
    }
    url(e) {
      let t;
      if (t = this.rules.inline.url.exec(e)) {
        let n, s;
        if (t[2] === "@") n = t[0], s = "mailto:" + n;
        else {
          let r;
          do
            r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
          while (r !== t[0]);
          n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
        }
        return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
      }
    }
    inlineText(e) {
      let t = this.rules.inline.text.exec(e);
      if (t) {
        let n = this.lexer.state.inRawBlock;
        return { type: "text", raw: t[0], text: t[0], escaped: n };
      }
    }
  };
  var x = class l {
    constructor(e) {
      __publicField(this, "tokens");
      __publicField(this, "options");
      __publicField(this, "state");
      __publicField(this, "inlineQueue");
      __publicField(this, "tokenizer");
      this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
      let t = { other: m, block: B.normal, inline: A.normal };
      this.options.pedantic ? (t.block = B.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = B.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t;
    }
    static get rules() {
      return { block: B, inline: A };
    }
    static lex(e, t) {
      return new l(t).lex(e);
    }
    static lexInline(e, t) {
      return new l(t).inlineTokens(e);
    }
    lex(e) {
      e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
      for (let t = 0; t < this.inlineQueue.length; t++) {
        let n = this.inlineQueue[t];
        this.inlineTokens(n.src, n.tokens);
      }
      return this.inlineQueue = [], this.tokens;
    }
    blockTokens(e, t = [], n = false) {
      this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
      let s = 1 / 0;
      for (; e; ) {
        if (e.length < s) s = e.length;
        else {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
        let r;
        if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
        if (r = this.tokenizer.space(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
          continue;
        }
        if (r = this.tokenizer.code(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
          continue;
        }
        if (r = this.tokenizer.fences(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.heading(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.hr(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.blockquote(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.list(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.html(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.def(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
          continue;
        }
        if (r = this.tokenizer.table(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        if (r = this.tokenizer.lheading(e)) {
          e = e.substring(r.raw.length), t.push(r);
          continue;
        }
        let i = e;
        if (this.options.extensions?.startBlock) {
          let o = 1 / 0, u = e.slice(1), a;
          this.options.extensions.startBlock.forEach((c) => {
            a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
          }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
        }
        if (this.state.top && (r = this.tokenizer.paragraph(i))) {
          let o = t.at(-1);
          n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
          continue;
        }
        if (r = this.tokenizer.text(e)) {
          e = e.substring(r.raw.length);
          let o = t.at(-1);
          o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
          continue;
        }
        if (e) {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
      }
      return this.state.top = true, t;
    }
    inline(e, t = []) {
      return this.inlineQueue.push({ src: e, tokens: t }), t;
    }
    inlineTokens(e, t = []) {
      this.tokenizer.lexer = this;
      let n = e, s = null;
      if (this.tokens.links) {
        let a = Object.keys(this.tokens.links);
        if (a.length > 0) for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null; ) a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
      }
      for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null; ) n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
      let r;
      for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null; ) r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
      n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
      let i = false, o = "", u = 1 / 0;
      for (; e; ) {
        if (e.length < u) u = e.length;
        else {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
        i || (o = ""), i = false;
        let a;
        if (this.options.extensions?.inline?.some((p) => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false)) continue;
        if (a = this.tokenizer.escape(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.tag(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.link(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.reflink(e, this.tokens.links)) {
          e = e.substring(a.raw.length);
          let p = t.at(-1);
          a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
          continue;
        }
        if (a = this.tokenizer.emStrong(e, n, o)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.codespan(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.br(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.del(e, n, o)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (a = this.tokenizer.autolink(e)) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        if (!this.state.inLink && (a = this.tokenizer.url(e))) {
          e = e.substring(a.raw.length), t.push(a);
          continue;
        }
        let c = e;
        if (this.options.extensions?.startInline) {
          let p = 1 / 0, k = e.slice(1), h;
          this.options.extensions.startInline.forEach((R) => {
            h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h));
          }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
        }
        if (a = this.tokenizer.inlineText(c)) {
          e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = true;
          let p = t.at(-1);
          p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
          continue;
        }
        if (e) {
          this.infiniteLoopError(e.charCodeAt(0));
          break;
        }
      }
      return t;
    }
    infiniteLoopError(e) {
      let t = "Infinite loop on byte: " + e;
      if (this.options.silent) console.error(t);
      else throw new Error(t);
    }
  };
  var y = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "parser");
      this.options = e || T;
    }
    space(e) {
      return "";
    }
    code({ text: e, lang: t, escaped: n }) {
      let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
      return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
    }
    blockquote({ tokens: e }) {
      return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
    }
    html({ text: e }) {
      return e;
    }
    def(e) {
      return "";
    }
    heading({ tokens: e, depth: t }) {
      return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
    }
    hr(e) {
      return `<hr>
`;
    }
    list(e) {
      let t = e.ordered, n = e.start, s = "";
      for (let o = 0; o < e.items.length; o++) {
        let u = e.items[o];
        s += this.listitem(u);
      }
      let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
      return "<" + r + i + `>
` + s + "</" + r + `>
`;
    }
    listitem(e) {
      return `<li>${this.parser.parse(e.tokens)}</li>
`;
    }
    checkbox({ checked: e }) {
      return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
    }
    paragraph({ tokens: e }) {
      return `<p>${this.parser.parseInline(e)}</p>
`;
    }
    table(e) {
      let t = "", n = "";
      for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
      t += this.tablerow({ text: n });
      let s = "";
      for (let r = 0; r < e.rows.length; r++) {
        let i = e.rows[r];
        n = "";
        for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
        s += this.tablerow({ text: n });
      }
      return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
    }
    tablerow({ text: e }) {
      return `<tr>
${e}</tr>
`;
    }
    tablecell(e) {
      let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
      return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
    }
    strong({ tokens: e }) {
      return `<strong>${this.parser.parseInline(e)}</strong>`;
    }
    em({ tokens: e }) {
      return `<em>${this.parser.parseInline(e)}</em>`;
    }
    codespan({ text: e }) {
      return `<code>${O(e, true)}</code>`;
    }
    br(e) {
      return "<br>";
    }
    del({ tokens: e }) {
      return `<del>${this.parser.parseInline(e)}</del>`;
    }
    link({ href: e, title: t, tokens: n }) {
      let s = this.parser.parseInline(n), r = J(e);
      if (r === null) return s;
      e = r;
      let i = '<a href="' + e + '"';
      return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i;
    }
    image({ href: e, title: t, text: n, tokens: s }) {
      s && (n = this.parser.parseInline(s, this.parser.textRenderer));
      let r = J(e);
      if (r === null) return O(n);
      e = r;
      let i = `<img src="${e}" alt="${O(n)}"`;
      return t && (i += ` title="${O(t)}"`), i += ">", i;
    }
    text(e) {
      return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
    }
  };
  var L = class {
    strong({ text: e }) {
      return e;
    }
    em({ text: e }) {
      return e;
    }
    codespan({ text: e }) {
      return e;
    }
    del({ text: e }) {
      return e;
    }
    html({ text: e }) {
      return e;
    }
    text({ text: e }) {
      return e;
    }
    link({ text: e }) {
      return "" + e;
    }
    image({ text: e }) {
      return "" + e;
    }
    br() {
      return "";
    }
    checkbox({ raw: e }) {
      return e;
    }
  };
  var b = class l2 {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "renderer");
      __publicField(this, "textRenderer");
      this.options = e || T, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
    }
    static parse(e, t) {
      return new l2(t).parse(e);
    }
    static parseInline(e, t) {
      return new l2(t).parseInline(e);
    }
    parse(e) {
      this.renderer.parser = this;
      let t = "";
      for (let n = 0; n < e.length; n++) {
        let s = e[n];
        if (this.options.extensions?.renderers?.[s.type]) {
          let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
          if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i.type)) {
            t += o || "";
            continue;
          }
        }
        let r = s;
        switch (r.type) {
          case "space": {
            t += this.renderer.space(r);
            break;
          }
          case "hr": {
            t += this.renderer.hr(r);
            break;
          }
          case "heading": {
            t += this.renderer.heading(r);
            break;
          }
          case "code": {
            t += this.renderer.code(r);
            break;
          }
          case "table": {
            t += this.renderer.table(r);
            break;
          }
          case "blockquote": {
            t += this.renderer.blockquote(r);
            break;
          }
          case "list": {
            t += this.renderer.list(r);
            break;
          }
          case "checkbox": {
            t += this.renderer.checkbox(r);
            break;
          }
          case "html": {
            t += this.renderer.html(r);
            break;
          }
          case "def": {
            t += this.renderer.def(r);
            break;
          }
          case "paragraph": {
            t += this.renderer.paragraph(r);
            break;
          }
          case "text": {
            t += this.renderer.text(r);
            break;
          }
          default: {
            let i = 'Token with "' + r.type + '" type was not found.';
            if (this.options.silent) return console.error(i), "";
            throw new Error(i);
          }
        }
      }
      return t;
    }
    parseInline(e, t = this.renderer) {
      this.renderer.parser = this;
      let n = "";
      for (let s = 0; s < e.length; s++) {
        let r = e[s];
        if (this.options.extensions?.renderers?.[r.type]) {
          let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
          if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
            n += o || "";
            continue;
          }
        }
        let i = r;
        switch (i.type) {
          case "escape": {
            n += t.text(i);
            break;
          }
          case "html": {
            n += t.html(i);
            break;
          }
          case "link": {
            n += t.link(i);
            break;
          }
          case "image": {
            n += t.image(i);
            break;
          }
          case "checkbox": {
            n += t.checkbox(i);
            break;
          }
          case "strong": {
            n += t.strong(i);
            break;
          }
          case "em": {
            n += t.em(i);
            break;
          }
          case "codespan": {
            n += t.codespan(i);
            break;
          }
          case "br": {
            n += t.br(i);
            break;
          }
          case "del": {
            n += t.del(i);
            break;
          }
          case "text": {
            n += t.text(i);
            break;
          }
          default: {
            let o = 'Token with "' + i.type + '" type was not found.';
            if (this.options.silent) return console.error(o), "";
            throw new Error(o);
          }
        }
      }
      return n;
    }
  };
  var _a;
  var P = (_a = class {
    constructor(e) {
      __publicField(this, "options");
      __publicField(this, "block");
      this.options = e || T;
    }
    preprocess(e) {
      return e;
    }
    postprocess(e) {
      return e;
    }
    processAllTokens(e) {
      return e;
    }
    emStrongMask(e) {
      return e;
    }
    provideLexer(e = this.block) {
      return e ? x.lex : x.lexInline;
    }
    provideParser(e = this.block) {
      return e ? b.parse : b.parseInline;
    }
  }, __publicField(_a, "passThroughHooks", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"])), __publicField(_a, "passThroughHooksRespectAsync", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"])), _a);
  var D = class {
    constructor(...e) {
      __publicField(this, "defaults", z());
      __publicField(this, "options", this.setOptions);
      __publicField(this, "parse", this.parseMarkdown(true));
      __publicField(this, "parseInline", this.parseMarkdown(false));
      __publicField(this, "Parser", b);
      __publicField(this, "Renderer", y);
      __publicField(this, "TextRenderer", L);
      __publicField(this, "Lexer", x);
      __publicField(this, "Tokenizer", w);
      __publicField(this, "Hooks", P);
      this.use(...e);
    }
    walkTokens(e, t) {
      let n = [];
      for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
        case "table": {
          let r = s;
          for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
          for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
          break;
        }
        case "list": {
          let r = s;
          n = n.concat(this.walkTokens(r.items, t));
          break;
        }
        default: {
          let r = s;
          this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
            let o = r[i].flat(1 / 0);
            n = n.concat(this.walkTokens(o, t));
          }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
        }
      }
      return n;
    }
    use(...e) {
      let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
      return e.forEach((n) => {
        let s = { ...n };
        if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
          if (!r.name) throw new Error("extension name required");
          if ("renderer" in r) {
            let i = t.renderers[r.name];
            i ? t.renderers[r.name] = function(...o) {
              let u = r.renderer.apply(this, o);
              return u === false && (u = i.apply(this, o)), u;
            } : t.renderers[r.name] = r.renderer;
          }
          if ("tokenizer" in r) {
            if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
            let i = t[r.level];
            i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
          }
          "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
        }), s.extensions = t), n.renderer) {
          let r = this.defaults.renderer || new y(this.defaults);
          for (let i in n.renderer) {
            if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
            if (["options", "parser"].includes(i)) continue;
            let o = i, u = n.renderer[o], a = r[o];
            r[o] = (...c) => {
              let p = u.apply(r, c);
              return p === false && (p = a.apply(r, c)), p || "";
            };
          }
          s.renderer = r;
        }
        if (n.tokenizer) {
          let r = this.defaults.tokenizer || new w(this.defaults);
          for (let i in n.tokenizer) {
            if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
            if (["options", "rules", "lexer"].includes(i)) continue;
            let o = i, u = n.tokenizer[o], a = r[o];
            r[o] = (...c) => {
              let p = u.apply(r, c);
              return p === false && (p = a.apply(r, c)), p;
            };
          }
          s.tokenizer = r;
        }
        if (n.hooks) {
          let r = this.defaults.hooks || new P();
          for (let i in n.hooks) {
            if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
            if (["options", "block"].includes(i)) continue;
            let o = i, u = n.hooks[o], a = r[o];
            P.passThroughHooks.has(i) ? r[o] = (c) => {
              if (this.defaults.async && P.passThroughHooksRespectAsync.has(i)) return (async () => {
                let k = await u.call(r, c);
                return a.call(r, k);
              })();
              let p = u.call(r, c);
              return a.call(r, p);
            } : r[o] = (...c) => {
              if (this.defaults.async) return (async () => {
                let k = await u.apply(r, c);
                return k === false && (k = await a.apply(r, c)), k;
              })();
              let p = u.apply(r, c);
              return p === false && (p = a.apply(r, c)), p;
            };
          }
          s.hooks = r;
        }
        if (n.walkTokens) {
          let r = this.defaults.walkTokens, i = n.walkTokens;
          s.walkTokens = function(o) {
            let u = [];
            return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
          };
        }
        this.defaults = { ...this.defaults, ...s };
      }), this;
    }
    setOptions(e) {
      return this.defaults = { ...this.defaults, ...e }, this;
    }
    lexer(e, t) {
      return x.lex(e, t ?? this.defaults);
    }
    parser(e, t) {
      return b.parse(e, t ?? this.defaults);
    }
    parseMarkdown(e) {
      return (n, s) => {
        let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async);
        if (this.defaults.async === true && r.async === false) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
        if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
        if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
        if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
          let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c;
          i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens));
          let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i);
          return i.hooks ? await i.hooks.postprocess(h) : h;
        })().catch(o);
        try {
          i.hooks && (n = i.hooks.preprocess(n));
          let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
          i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
          let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
          return i.hooks && (p = i.hooks.postprocess(p)), p;
        } catch (u) {
          return o(u);
        }
      };
    }
    onError(e, t) {
      return (n) => {
        if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
          let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
          return t ? Promise.resolve(s) : s;
        }
        if (t) return Promise.reject(n);
        throw n;
      };
    }
  };
  var M = new D();
  function g(l3, e) {
    return M.parse(l3, e);
  }
  g.options = g.setOptions = function(l3) {
    return M.setOptions(l3), g.defaults = M.defaults, G(g.defaults), g;
  };
  g.getDefaults = z;
  g.defaults = T;
  g.use = function(...l3) {
    return M.use(...l3), g.defaults = M.defaults, G(g.defaults), g;
  };
  g.walkTokens = function(l3, e) {
    return M.walkTokens(l3, e);
  };
  g.parseInline = M.parseInline;
  g.Parser = b;
  g.parser = b.parse;
  g.Renderer = y;
  g.TextRenderer = L;
  g.Lexer = x;
  g.lexer = x.lex;
  g.Tokenizer = w;
  g.Hooks = P;
  g.parse = g;
  var jt = g.options;
  var Ft = g.setOptions;
  var Ut = g.use;
  var Kt = g.walkTokens;
  var Wt = g.parseInline;
  var Jt = b.parse;
  var Vt = x.lex;

  // src-ts/chat.ts
  g.setOptions({ gfm: true, breaks: true });
  var esc = (s) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(s ?? "").replace(/[&<>"']/g, (c) => map[c] || c);
  };
  var $2 = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`#${id} not found`);
    return el;
  };
  var $sel = (id) => $2(id);
  var $textarea = (id) => $2(id);
  var $button = (id) => $2(id);
  var TOKEN = sessionStorage.getItem("hermytt-token") || "";
  var CURRENT_USER = null;
  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (TOKEN) h["X-Hermytt-Key"] = TOKEN;
    return h;
  }
  async function logout() {
    try {
      await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
    }
    sessionStorage.removeItem("hermytt-token");
    location.href = "/login";
  }
  function showStatus(msg, level = "") {
    const el = $2("status");
    el.textContent = msg;
    el.className = "show " + level;
  }
  function hideStatus() {
    $2("status").className = "";
  }
  var State = {
    servers: [],
    currentServer: null,
    backends: [],
    currentBackend: null,
    sessions: [],
    currentSid: null,
    currentDir: null,
    messages: [],
    streaming: false,
    abortCtl: null,
    pendingAttachments: []
  };
  (async () => {
    try {
      const r = await fetch("/auth/me", { credentials: "same-origin" });
      if (r.ok) {
        const d2 = await r.json();
        if (d2.username) {
          CURRENT_USER = d2.username;
          $2("whoami").textContent = d2.username;
        }
      }
    } catch {
    }
    if (!CURRENT_USER && TOKEN) {
      try {
        const r2 = await fetch("/info", { headers: { "X-Hermytt-Key": TOKEN } });
        if (!r2.ok) {
          location.href = "/login?next=/chat";
          return;
        }
      } catch {
        location.href = "/login?next=/chat";
        return;
      }
    } else if (!CURRENT_USER && !TOKEN) {
      location.href = "/login?next=/chat";
      return;
    }
    await refreshServers();
    await refreshAfterServerChange();
  })();
  async function refreshServers() {
    try {
      const r = await fetch("/registry", { credentials: "same-origin", headers: authHeaders() });
      if (!r.ok) {
        showStatus("failed to fetch registry", "err");
        return;
      }
      const d2 = await r.json();
      State.servers = (d2.services || []).filter((s) => s.role === "gateway" && s.status === "connected");
      const sel = $sel("server");
      if (!State.servers.length) {
        sel.innerHTML = '<option value="">no apytti instances connected</option>';
        sel.disabled = true;
        $2("side").innerHTML = `<div class="empty">no apytti instances are registered.<br><br>Start one and configure it to announce to <code>${esc(location.origin)}</code>.</div>`;
        return;
      }
      sel.disabled = false;
      sel.innerHTML = State.servers.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
      if (!State.currentServer || !State.servers.find((s) => s.name === State.currentServer)) {
        State.currentServer = State.servers[0].name;
        sel.value = State.currentServer;
      }
    } catch (e) {
      showStatus("registry error: " + e, "err");
    }
  }
  $sel("server").addEventListener("change", async () => {
    State.currentServer = $sel("server").value;
    State.currentBackend = null;
    State.currentSid = null;
    State.currentDir = null;
    State.messages = [];
    await refreshAfterServerChange();
  });
  async function refreshAfterServerChange() {
    if (!State.currentServer) return;
    await loadHealth();
    await refreshSessions();
    renderMessages({ forceScroll: true });
  }
  async function loadHealth() {
    if (!State.currentServer) return;
    const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
    try {
      const r = await fetch(`${proxy}/health`, { credentials: "same-origin", headers: authHeaders() });
      if (!r.ok) {
        showStatus(`server ${State.currentServer} unreachable (${r.status})`, "err");
        return;
      }
      const h = await r.json();
      State.backends = h.enabled_backends || [];
      if (!State.currentBackend || !State.backends.includes(State.currentBackend)) {
        State.currentBackend = h.active_backend && State.backends.includes(h.active_backend) ? h.active_backend : State.backends[0] || null;
      }
      const sel = $sel("backend");
      if (!State.backends.length) {
        sel.innerHTML = '<option value="">no backends enabled</option>';
        sel.disabled = true;
        showStatus(`${State.currentServer} has no backends enabled \u2014 configure one in admin \u2192 ${State.currentServer} \u2192 Config`, "warn");
      } else {
        sel.disabled = false;
        sel.innerHTML = State.backends.map((b2) => `<option value="${esc(b2)}" ${b2 === State.currentBackend ? "selected" : ""}>${esc(b2)}</option>`).join("");
        hideStatus();
      }
    } catch (e) {
      showStatus("health check failed: " + e, "err");
    }
  }
  $sel("backend").addEventListener("change", async () => {
    State.currentBackend = $sel("backend").value;
    State.currentSid = null;
    State.currentDir = null;
    State.messages = [];
    await refreshSessions();
    renderMessages({ forceScroll: true });
  });
  async function refreshSessions() {
    const side = $2("side");
    if (!State.currentServer || !State.currentBackend) {
      side.innerHTML = `<div class="empty">pick a server + backend first</div>`;
      return;
    }
    side.innerHTML = `<div class="empty">loading\u2026</div>`;
    try {
      const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
      const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions`, { credentials: "same-origin", headers: authHeaders() });
      if (!r.ok) {
        side.innerHTML = `<div class="empty" style="color:var(--red)">err ${r.status}</div>`;
        return;
      }
      const d2 = await r.json();
      State.sessions = d2.sessions || [];
      if (!State.sessions.length) {
        side.innerHTML = `<div class="empty">no ${esc(State.currentBackend)} sessions yet \u2014 say something below to start one</div>`;
        return;
      }
      side.innerHTML = State.sessions.map((s) => {
        const sel = s.session_id === State.currentSid ? " selected" : "";
        const when = s.modified_at ? relTime(Date.parse(s.modified_at)) : "";
        const project = s.dir ? s.dir.split("/").filter(Boolean).pop() || s.dir : "(no dir)";
        const firstMsg = (s.first_message || "").slice(0, 80);
        return `<div class="row${sel}" data-sid="${esc(s.session_id)}" onclick="selectSession('${esc(s.session_id)}')" title="${esc(s.dir || "")}">
        <div class="project">${esc(project)}</div>
        ${firstMsg ? `<div class="preview-small">${esc(firstMsg)}</div>` : ""}
        <div class="meta"><span></span><span>${esc(when)}<span data-status-for="${esc(s.session_id)}"></span></span></div>
      </div>`;
      }).join("");
      const targets = [];
      if (State.currentSid) targets.push(State.currentSid);
      for (const s of State.sessions.slice(0, 10)) {
        if (s.session_id !== State.currentSid) targets.push(s.session_id);
      }
      targets.forEach((sid, i) => setTimeout(() => probeStatus(sid), i * 200));
    } catch (e) {
      side.innerHTML = `<div class="empty" style="color:var(--red)">${esc(String(e))}</div>`;
    }
  }
  async function probeStatus(sid) {
    if (!State.currentServer || !State.currentBackend) return;
    try {
      const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
      const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(sid)}/status`, { credentials: "same-origin", headers: authHeaders() });
      if (!r.ok) return;
      const d2 = await r.json();
      const slot = document.querySelector(`[data-status-for="${CSS.escape(sid)}"]`);
      if (slot && d2.active) {
        slot.innerHTML = ` <span title="another claude is using this session" style="color:var(--yellow)">\u26A0</span>`;
      }
    } catch {
    }
  }
  async function selectSession(sid) {
    if (State.streaming) return;
    if (!State.currentServer || !State.currentBackend) return;
    const session = State.sessions.find((s) => s.session_id === sid);
    State.currentSid = sid;
    State.currentDir = session?.dir || null;
    for (const row of Array.from(document.querySelectorAll("#side .row"))) {
      row.classList.toggle("selected", row.dataset["sid"] === sid);
    }
    $2("ctxbar").textContent = State.currentDir ? `${State.currentServer} \xB7 ${State.currentBackend} \xB7 ${State.currentDir}` : `${State.currentServer} \xB7 ${State.currentBackend}`;
    const msgs = $2("msgs");
    msgs.innerHTML = `<div class="empty">loading\u2026</div>`;
    try {
      const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
      const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(sid)}/messages`, { credentials: "same-origin", headers: authHeaders() });
      if (!r.ok) {
        msgs.innerHTML = `<div class="empty" style="color:var(--red)">err ${r.status}</div>`;
        return;
      }
      const d2 = await r.json();
      State.messages = d2.messages || [];
      State._lastSig = messagesSignature(State.messages);
      renderMessages({ forceScroll: true });
    } catch (e) {
      msgs.innerHTML = `<div class="empty" style="color:var(--red)">${esc(String(e))}</div>`;
    }
  }
  $button("btn-new").addEventListener("click", () => {
    if (State.streaming) return;
    State.currentSid = null;
    State.currentDir = null;
    State.messages = [];
    for (const row of Array.from(document.querySelectorAll("#side .row"))) row.classList.remove("selected");
    $2("ctxbar").textContent = `${State.currentServer} \xB7 ${State.currentBackend} \xB7 (new \u2014 first message picks the cwd)`;
    $2("msgs").innerHTML = `<div class="empty">type a message below to start a new ${esc(State.currentBackend)} session</div>`;
    $textarea("input").focus();
  });
  $button("btn-refresh").addEventListener("click", async () => {
    await refreshServers();
    await loadHealth();
    await refreshSessions();
    if (State.currentSid && State.currentServer && State.currentBackend && !State.streaming) {
      try {
        const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
        const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(State.currentSid)}/messages`, { credentials: "same-origin", headers: authHeaders() });
        if (r.ok) {
          const d2 = await r.json();
          const fresh = d2.messages || [];
          const newSig = messagesSignature(fresh);
          if (newSig !== State._lastSig) {
            State.messages = fresh;
            State._lastSig = newSig;
            renderMessages({ forceScroll: true });
          }
        }
      } catch {
      }
    }
  });
  function toggleDrawer(open) {
    const cls = document.body.classList;
    if (typeof open === "boolean") cls.toggle("drawer-open", open);
    else cls.toggle("drawer-open");
  }
  var drawerBtn = document.getElementById("btn-drawer");
  if (drawerBtn) drawerBtn.addEventListener("click", () => toggleDrawer());
  var drawerBackdrop = document.getElementById("drawer-backdrop");
  if (drawerBackdrop) drawerBackdrop.addEventListener("click", () => toggleDrawer(false));
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!target) return;
    if (target.closest("#side .row")) toggleDrawer(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720) toggleDrawer(false);
  });
  var VIEW_LIMIT = 100;
  var viewStartIdx = 0;
  var renderedCount = 0;
  function renderMessages(opts = {}) {
    const msgs = $2("msgs");
    const wasAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    if (!State.messages.length) {
      msgs.innerHTML = `<div class="empty">${State.currentSid ? "empty session" : "pick a session on the left, or click + new"}</div>`;
      viewStartIdx = 0;
      renderedCount = 0;
      return;
    }
    const total = State.messages.length;
    viewStartIdx = Math.max(0, total - VIEW_LIMIT);
    const visible = State.messages.slice(viewStartIdx);
    let html = "";
    if (viewStartIdx > 0) html += renderLoadOlderBtn();
    html += visible.map((m2) => renderBubble(m2)).join("");
    msgs.innerHTML = html;
    renderedCount = visible.length;
    if (opts.forceScroll || wasAtBottom) {
      msgs.scrollTop = msgs.scrollHeight;
    }
  }
  function renderLoadOlderBtn() {
    const remaining = viewStartIdx;
    const next = Math.min(VIEW_LIMIT, remaining);
    return `<button class="load-older" onclick="loadOlder()">\u2191 Load ${next} older message${next === 1 ? "" : "s"} (${remaining} above)</button>`;
  }
  function loadOlder() {
    const msgs = $2("msgs");
    const oldStart = viewStartIdx;
    viewStartIdx = Math.max(0, viewStartIdx - VIEW_LIMIT);
    const newOnes = State.messages.slice(viewStartIdx, oldStart);
    const oldHeight = msgs.scrollHeight;
    const oldScroll = msgs.scrollTop;
    const existingBtn = msgs.querySelector(".load-older");
    if (existingBtn) existingBtn.remove();
    let html = "";
    if (viewStartIdx > 0) html += renderLoadOlderBtn();
    html += newOnes.map(renderBubble).join("");
    msgs.insertAdjacentHTML("afterbegin", html);
    renderedCount += newOnes.length;
    const heightDelta = msgs.scrollHeight - oldHeight;
    msgs.scrollTop = oldScroll + heightDelta;
  }
  function appendNewMessages() {
    const msgs = $2("msgs");
    if (renderedCount === 0 || viewStartIdx + renderedCount > State.messages.length) {
      return renderMessages();
    }
    if (viewStartIdx + renderedCount === State.messages.length) return;
    const wasAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const fragment = State.messages.slice(viewStartIdx + renderedCount).map(renderBubble).join("");
    msgs.insertAdjacentHTML("beforeend", fragment);
    renderedCount = State.messages.length - viewStartIdx;
    if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;
  }
  function messagesSignature(arr) {
    if (!arr || !arr.length) return "0";
    const last = arr[arr.length - 1];
    return `${arr.length}:${(last.content || "").length}:${last.timestamp || ""}`;
  }
  function fmtTimestamp(iso) {
    if (!iso) return { rel: "", full: "" };
    const d2 = new Date(iso);
    if (isNaN(d2.getTime())) return { rel: "", full: "" };
    const now = Date.now();
    const ago = Math.floor((now - d2.getTime()) / 1e3);
    let rel = "";
    if (ago < 0) rel = "just now";
    else if (ago < 10) rel = "just now";
    else if (ago < 60) rel = `${ago}s ago`;
    else if (ago < 3600) rel = `${Math.floor(ago / 60)}m ago`;
    else if (ago < 86400) rel = `${Math.floor(ago / 3600)}h ago`;
    else if (ago < 7 * 86400) rel = `${Math.floor(ago / 86400)}d ago`;
    else rel = d2.toLocaleDateString(void 0, { month: "short", day: "numeric" });
    const full = d2.toLocaleString(void 0, { dateStyle: "medium", timeStyle: "short" });
    return { rel, full };
  }
  function renderBubble(m2) {
    const role = m2.role || "unknown";
    let html;
    try {
      html = g.parse(m2.content || "", { async: false });
    } catch {
      html = `<p>${esc(m2.content || "")}</p>`;
    }
    const withChips = html.replace(/\[tool:\s*([^\]]+)\]/g, (_2, n) => `<span class="tool-chip">${esc(n.trim())}</span>`).replace(/\[tool result\]/g, `<span class="tool-chip result">tool result</span>`).replace(/\[thinking\]/g, `<span class="thinking">[thinking]</span>`);
    const tools = (m2.tool_uses || []).map(
      (t) => `<span class="tu" title="${esc(t.input_summary || "")}"><strong>${esc(t.name)}</strong>${esc(t.input_summary || "")}</span>`
    ).join("");
    const model = m2.model ? `<span class="model">${esc(m2.model)}</span>` : "";
    const { rel, full } = fmtTimestamp(m2.timestamp);
    const tsTag = rel ? `<span class="ts" title="${esc(full)}">${esc(rel)}</span>` : "";
    return `<div class="msg ${esc(role)}">
    <div class="role"><span>${esc(role)}</span>${model}${tsTag}</div>
    <div class="content">${withChips}</div>
    ${tools ? `<div class="tool-uses">${tools}</div>` : ""}
  </div>`;
  }
  $textarea("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!State.streaming) send();
    }
  });
  $button("send").addEventListener("click", () => {
    if (State.streaming) {
      killCurrent();
    } else {
      send();
    }
  });
  function killCurrent() {
    if (!State.streaming || !State.abortCtl) return;
    State.abortCtl.abort();
  }
  function inferKind(mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "document";
  }
  function fileToAttachment(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.includes(",") ? dataUrl.split(",", 2)[1] : dataUrl;
        const mimeType = file.type || "application/octet-stream";
        const kind = inferKind(mimeType);
        const ext = mimeType.split("/")[1] || "bin";
        const name = file.name && file.name !== "image.png" ? file.name : `pasted_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}.${ext}`;
        resolve({
          name,
          kind,
          mimeType,
          data: base64,
          previewUrl: kind === "image" ? dataUrl : void 0,
          size: file.size
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  function formatBytes(n) {
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / 1024 / 1024).toFixed(1)}MB`;
  }
  function renderAttachments() {
    const slot = $2("attachments");
    if (!State.pendingAttachments.length) {
      slot.innerHTML = "";
      return;
    }
    slot.innerHTML = State.pendingAttachments.map((a, i) => {
      const visual = a.previewUrl ? `<img src="${a.previewUrl}" alt="${esc(a.name)}">` : `<span class="icon">\u{1F4CE}</span>`;
      return `<div class="attachment-chip">
      ${visual}
      <span class="name" title="${esc(a.name)}">${esc(a.name)}</span>
      <span class="size">${esc(formatBytes(a.size))}</span>
      <span class="remove" onclick="removeAttachment(${i})" title="remove">\xD7</span>
    </div>`;
    }).join("");
  }
  function removeAttachment(i) {
    const removed = State.pendingAttachments.splice(i, 1)[0];
    if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
    renderAttachments();
  }
  async function ingestFiles(files) {
    const list = Array.from(files);
    for (const f of list) {
      try {
        State.pendingAttachments.push(await fileToAttachment(f));
      } catch (e) {
        showStatus(`failed to read ${f.name}: ${e}`, "err");
      }
    }
    renderAttachments();
  }
  $textarea("input").addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    await ingestFiles(files);
  });
  window.addEventListener("dragover", (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    document.body.classList.add("drag-over");
  });
  window.addEventListener("dragleave", (e) => {
    if (e.relatedTarget) return;
    document.body.classList.remove("drag-over");
  });
  window.addEventListener("drop", async (e) => {
    if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    document.body.classList.remove("drag-over");
    await ingestFiles(e.dataTransfer.files);
    $textarea("input").focus();
  });
  async function send() {
    if (State.streaming) return;
    if (!State.currentServer || !State.currentBackend) {
      showStatus("pick server + backend first", "warn");
      return;
    }
    const input = $textarea("input");
    const text = input.value.trim();
    if (!text && State.pendingAttachments.length === 0) return;
    const attachments = State.pendingAttachments.splice(0);
    renderAttachments();
    const userBubbleContent = attachments.length ? attachments.map((a) => `\u{1F4CE} ${a.name}`).join("\n") + (text ? "\n\n" + text : "") : text;
    State.messages.push({ role: "user", content: userBubbleContent, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    const partial = { role: "assistant", content: "", timestamp: (/* @__PURE__ */ new Date()).toISOString() };
    State.messages.push(partial);
    appendNewMessages();
    input.value = "";
    State.streaming = true;
    document.body.classList.add("streaming");
    $button("send").textContent = "\u2717 Stop";
    const wireAttachments = attachments.map((a) => ({
      data: a.data,
      kind: a.kind,
      name: a.name
    }));
    const body = {
      prompt: text || "(see attachment)",
      // apytti < 0.6.3 rejected empty prompts; harmless on newer
      backend: State.currentBackend,
      stream: true
    };
    if (State.currentSid) body["session_id"] = State.currentSid;
    if (State.currentDir) body["dir"] = State.currentDir;
    if (wireAttachments.length) body["attachments"] = wireAttachments;
    const ctl = new AbortController();
    State.abortCtl = ctl;
    try {
      const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
      const r = await fetch(`${proxy}/api/ask`, {
        method: "POST",
        credentials: "same-origin",
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal: ctl.signal
      });
      if (!r.ok || !r.body) {
        const t = await r.text().catch(() => "");
        partial.content = `[error ${r.status}] ${t}`;
        updateLastBubble(partial);
        return;
      }
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("event-stream")) {
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const lines = block.split("\n");
            let event = "message", data = "";
            for (const ln of lines) {
              if (ln.startsWith("event:")) event = ln.slice(6).trim();
              else if (ln.startsWith("data:")) data += (data ? "\n" : "") + ln.slice(5).replace(/^ /, "");
            }
            if (!data) continue;
            let payload;
            try {
              payload = JSON.parse(data);
            } catch {
              continue;
            }
            if (event === "delta" && payload.text) {
              partial.content += payload.text;
              updateLastBubble(partial);
            } else if (event === "done") {
              partial.content = payload.response || partial.content;
              if (payload.session_id) State.currentSid = payload.session_id;
              if (payload.cost_usd != null) partial.cost_usd = payload.cost_usd;
              if (payload.backend) partial.model = payload.backend;
              updateLastBubble(partial);
            } else if (event === "error") {
              partial.content += `
[error] ${payload.error || "unknown"}`;
              updateLastBubble(partial);
            }
          }
        }
      } else {
        const data = await r.json();
        if (data.error) partial.content = `[error] ${data.error}`;
        else {
          partial.content = data.response || "";
          if (data.session_id) State.currentSid = data.session_id;
          if (data.backend) partial.model = data.backend;
        }
        updateLastBubble(partial);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        partial.content = (partial.content || "") + "\n[stopped]";
        updateLastBubble(partial);
      } else {
        partial.content = `[error] ${String(e)}`;
        updateLastBubble(partial);
      }
    } finally {
      State.streaming = false;
      document.body.classList.remove("streaming");
      State.abortCtl = null;
      $button("send").textContent = "Send";
      State._lastSig = messagesSignature(State.messages);
      if (State.currentSid && !State.sessions.find((s) => s.session_id === State.currentSid)) {
        refreshSessions();
      }
    }
  }
  function updateLastBubble(partial) {
    const msgs = $2("msgs");
    const last = msgs.lastElementChild;
    if (!last) {
      renderMessages({ forceScroll: true });
      return;
    }
    const wasAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    const fresh = document.createElement("div");
    fresh.innerHTML = renderBubble(partial);
    if (fresh.firstElementChild) msgs.replaceChild(fresh.firstElementChild, last);
    if (wasAtBottom) msgs.scrollTop = msgs.scrollHeight;
  }
  function relTime(ms) {
    const diff = Math.floor((Date.now() - ms) / 1e3);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  var pollTickCount = 0;
  async function backgroundPoll() {
    if (State.streaming) return;
    if (document.visibilityState !== "visible") return;
    if (!State.currentServer || !State.currentBackend) return;
    pollTickCount++;
    if (State.currentSid) {
      try {
        const proxy = `/registry/${encodeURIComponent(State.currentServer)}/proxy`;
        const since = State.messages.length;
        const r = await fetch(`${proxy}/backends/${encodeURIComponent(State.currentBackend)}/sessions/${encodeURIComponent(State.currentSid)}/messages?since=${since}`, { credentials: "same-origin", headers: authHeaders() });
        if (r.ok) {
          const d2 = await r.json();
          const incoming = d2.messages || [];
          const total = typeof d2.total === "number" ? d2.total : since + incoming.length;
          if (incoming.length === 0 && total === since) {
          } else if (incoming.length === total) {
            State.messages = incoming;
            State._lastSig = messagesSignature(State.messages);
            renderMessages();
          } else {
            State.messages = State.messages.concat(incoming);
            State._lastSig = messagesSignature(State.messages);
            appendNewMessages();
          }
        }
      } catch {
      }
    }
    if (pollTickCount % 6 === 0) refreshSessions();
  }
  setInterval(backgroundPoll, 5e3);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") backgroundPoll();
  });
  window.selectSession = selectSession;
  window.loadOlder = loadOlder;
  window.logout = logout;
  window.removeAttachment = removeAttachment;
})();
