// SNS に貼る結果の画像カード（1200×630）を canvas に描く。

const W = 1200;
const H = 630;
const FONT = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif';

const COLORS = {
  bg: "#faf6ef",
  paper: "#fffdf8",
  ink: "#3a3129",
  muted: "#8a7d70",
  line: "#e6dccd",
  accent: "#c8665a",
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// info: { gameName, rank, ending, titleLabel, title, netWorthLabel, netWorth, lines: [string], hashtag }
export function drawShareCard(canvas, info) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // 日記帳の紙
  roundRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  for (let y = 150; y < H - 40; y += 56) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(W - 40, y);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(40, 40, 18, H - 80);
  ctx.restore();

  ctx.fillStyle = COLORS.accent;
  ctx.font = `bold 40px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(info.gameName, 96, 116, 640);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `26px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(info.hashtag, W - 96, 116, 380);
  ctx.textAlign = "left";

  // ランク
  ctx.fillStyle = COLORS.accent;
  ctx.font = `bold 220px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(info.rank, 290, 410);
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(info.ending, 290, 486, 420);
  ctx.textAlign = "left";

  // 称号と純資産
  const x = 540;
  ctx.fillStyle = COLORS.muted;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(info.titleLabel, x, 206);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText(info.title, x, 262, W - 96 - x);

  ctx.fillStyle = COLORS.muted;
  ctx.font = `28px ${FONT}`;
  ctx.fillText(info.netWorthLabel, x, 318);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText(info.netWorth, x, 374);

  ctx.fillStyle = COLORS.ink;
  ctx.font = `28px ${FONT}`;
  info.lines.forEach((line, i) => ctx.fillText(line, x, 432 + i * 56, W - 96 - x));
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
