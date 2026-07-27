export const PHONE_PATTERNS = [
  // Standard formats
  /\b\d{10,13}\b/,                            // 10-13 digit number
  /\b[\+]?[\d\s\-\.\(\)]{10,17}\b/,          // with spaces, dashes, parens
  /\b\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}\b/,    // 123-456-7890
  /\b\d{4}[\s\-]\d{3}[\s\-]\d{4}\b/          // 0812 345 6789 (Nigerian format)
];

export const EMAIL_PATTERNS = [
  /[a-zA-Z0-9._%+\-]+\s*@\s*[a-zA-Z0-9.\-]+\s*\.\s*[a-zA-Z]{2,}/,
  /[a-zA-Z0-9._%+\-]+\s*@\s*[a-zA-Z0-9.\-]+\s*dot\s*[a-zA-Z]{2,}/i,
  /[a-zA-Z0-9._%+\-]+\s*\[at\]\s*[a-zA-Z0-9.\-]+\s*(\.\s*[a-zA-Z]{2,}|\b)/i,
  /[a-zA-Z0-9._%+\-]+\s*\(at\)\s*[a-zA-Z0-9.\-]+\s*(\.\s*[a-zA-Z]{2,}|\b)/i,
  /[a-zA-Z0-9._%+\-]+\s*\[at\]\s*[a-zA-Z0-9.\-]+/i,
  /[a-zA-Z0-9._%+\-]+\s*\(at\)\s*[a-zA-Z0-9.\-]+/i
];

export const PLATFORM_PATTERNS = [
  // WhatsApp — all the ways people write it
  /wh?[a4@]t[s5][a4@][p]+/i,
  /w[\s\.\-_]*h[\s\.\-_]*[a4@][\s\.\-_]*t[\s\.\-_]*s[\s\.\-_]*[a4@][\s\.\-_]*p/i,
  /wts[\s\-_]*[a4@]p/i,
  /w[\s\.]+[a-z]{1,2}[\s\.]+[a-z]{1,2}[\s\.]+[a-z]{1,2}[\s\.]+[a-z]{1,2}/i, // w h a t s a p p
  /watsup/i,
  /whats\s*up\s*(me|app)?/i,
  /hit\s*(me|us)\s*(on|up)\s*wa/i,

  // Snapchat
  /sn[a4@]p[\s\-_]*ch[a4@]t/i,
  /s[\s\.]*n[\s\.]*[a4@][\s\.]*p/i,
  /my\s*snap/i,
  /snap\s*me/i,
  /snapch[a4@]t/i,

  // Instagram
  /inst[a4@]gr[a4@]m/i,
  /insta\b/i,
  /ig\b.*\bme\b/i,
  /follow\s*me\s*on\s*ig/i,
  /@[a-zA-Z0-9_\.]{3,30}/,                  // @username pattern

  // Telegram
  /t[e3]l[e3]gr[a4@]m/i,
  /t[\s\.]*[e3][\s\.]*l[\s\.]*[e3][\s\.]*g/i,
  /tg\b/i,
  /telg/i,

  // Twitter / X
  /tw[i1]tt[e3]r/i,
  /\bx\.com/i,

  // Facebook
  /f[a4@]c[e3]b[o0][o0]k/i,
  /fb\s*me/i,
  /add\s*me\s*on\s*fb/i,

  // TikTok
  /t[i1]kt[o0]k/i,

  // Number obfuscation — phonetic digits
  /z[e3]r[o0]|[o0]ne|tw[o0]|thr[e3][e3]|f[o0]ur|f[i1]v[e3]|s[i1]x|s[e3]v[e3]n|[e3][i1]ght|n[i1]n[e3]/i,
];

export const SEPARATED_PLATFORM_PATTERNS = [
  /w[\W_]{0,2}h[\W_]{0,2}[a4@][\W_]{0,2}t[\W_]{0,2}[s5][\W_]{0,2}[a4@][\W_]{0,2}p[\W_]{0,2}p/i,
  /s[\W_]{0,2}n[\W_]{0,2}[a4@][\W_]{0,2}p[\W_]{0,2}c[\W_]{0,2}h[\W_]{0,2}[a4@][\W_]{0,2}t/i,
  /t[\W_]{0,2}[e3][\W_]{0,2}l[\W_]{0,2}[e3][\W_]{0,2}g[\W_]{0,2}r[\W_]{0,2}[a4@][\W_]{0,2}m/i,
  /i[\W_]{0,2}n[\W_]{0,2}[s5][\W_]{0,2}t[\W_]{0,2}[a4@][\W_]{0,2}g[\W_]{0,2}r[\W_]{0,2}[a4@][\W_]{0,2}m/i,
];

export const OFFPLATFORM_PHRASES = [
  /reach\s*me\s*(outside|off(site|line)?)/i,
  /contact\s*(me|us)\s*(outside|off(site|line)?)/i,
  /let['s]{0,2}\s*(talk|chat|meet)\s*(outside|off)/i,
  /off\s*platform/i,
  /outside\s*(this\s*)?app/i,
  /text\s*me/i,
  /call\s*me\s*(on|at)/i,
  /my\s*number\s*(is|:)/i,
  /number\s*is/i,
  /ping\s*me/i,
  /hit\s*me\s*up/i,
  /dm\s*me\s*on/i,
];
