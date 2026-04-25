const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 to avoid confusion

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 7; i++) {
    if (i === 3) { code += '-'; continue; }
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code; // format: XXX-XXX
}

module.exports = { generateInviteCode };
