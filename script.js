'use strict';

const cells = 32;

function getSizes(canvas) {
	const cw = Math.floor(canvas.width / cells);
	const ch = Math.floor(canvas.height / cells);
	let width = cw * cells, height = ch * cells;
	if (width < canvas.width) {
		width++;
	}
	if (height < canvas.height) {
		height++;
	}
	return {cw, ch, width, height};
}

function getPosition() {
	const defX = 160, defY = 112;
	const elPosX = document.getElementById('pos-x');
	const elPosY = document.getElementById('pos-y');
	if (!elPosX || !elPosY) {
		const error = 'The position inputs were not found.';
		return {posX: defX, posY: defY, error};
	}
	if (!elPosX.validity.valid || !elPosY.validity.valid) {
		const error = 'The position inputs must be valid.';
		return {posX: defX, posY: defY, error};
	}
	const posX = elPosX.valueAsNumber;
	const posY = elPosY.valueAsNumber;
	if (posX < 0 || posY < 0 || posX > 223 || posY > 207) {
		const error = 'The position must be in range (0-223, 0-207).';
		return {posX: defX, posY: defY, error};
	}
	return {posX, posY, error: null};
}

function drawBG(canvas) {
	const {width, height} = getSizes(canvas);
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#C0C0C0";
	ctx.fillRect(0, 0, width, height);
}

function drawGrid(canvas) {
	const sepCol = '#20E0E0', normCol = '#808080';
	const {cw, ch, width, height} = getSizes(canvas);
	const {posX, posY} = getPosition();
	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;
	ctx.lineWidth = 1;
	ctx.strokeStyle = normCol;
	for (let i = 0; i < cells; i++) {
		const x = i*cw + 0.5
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();

		const y = i*ch + 0.5
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}

	ctx.strokeStyle = ((posX + cells) % 16 === 0) ? sepCol : normCol;
	const x = width - 0.5;
	ctx.beginPath();
	ctx.moveTo(x, 0);
	ctx.lineTo(x, height);
	ctx.stroke();

	ctx.strokeStyle = ((posY + cells) % 16 === 0) ? sepCol : normCol;
	const y = height - 0.5;
	ctx.beginPath();
	ctx.moveTo(0, y);
	ctx.lineTo(width, y);
	ctx.stroke();

	ctx.strokeStyle = sepCol;
	for (let i = 0; i < cells; i++) {
		if ((posX + i) % 16 === 0) {
			const x = i*cw + 0.5
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
		}

		if ((posY + i) % 16 === 0) {
			const y = i*ch + 0.5
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
			ctx.stroke();
		}
	}
}

function runGrid(canvId, bs, bc, program) {
	const canvas = document.getElementById(canvId);
	const {cw, ch, width, height} = getSizes(canvas);
	const {posX, posY} = getPosition();
	const maybeMove = [], badMove = [], sMove = [], cMove = [];

	drawBG(canvas);

	const ctx = canvas.getContext('2d');
	ctx.imageSmoothingEnabled = false;

	for (let dy = 0; dy < cells; dy++) {
		const y = posY + dy;
		const py = dy * ch;
		for (let dx = 0; dx < cells; dx++) {
			const x = posX + dx;
			const px = dx * cw;

			const cs = new Core(program);
			cs.Vars.set('PlayerX', x);
			cs.Vars.set('PlayerY', y);
			cs.Vars.set('!branchType', bs);
			const sDone = cs.run();

			const cc = new Core(program);
			cc.Vars.set('PlayerX', x);
			cc.Vars.set('PlayerY', y);
			cc.Vars.set('!branchType', bc);
			const cDone = cc.run();

			const sHit = cs.Vars.has('!branchHit');
			const cHit = cc.Vars.has('!branchHit');
			const sCollide = cs.Vars.get('!branchHit');
			const cCollide = cc.Vars.get('!branchHit');

			let color;
			if (!sDone || !cDone) {
				color = '#800000';
			} else if (!sHit || !cHit) {
				color = '#C0A0A0';
			} else if (sCollide === cCollide) {
				color = '#E000E0';
			} else if (sCollide) {
				color = '#00E000';
			} else {
				color = '#0000FF';
			}
			ctx.fillStyle = color;
			ctx.fillRect(px, py, cw, ch);

			const nxs = cs.Vars.get('PlayerX');
			const nys = cs.Vars.get('PlayerY');
			const nxc = cc.Vars.get('PlayerX');
			const nyc = cc.Vars.get('PlayerY');
			if (nxs !== x || nys !== y) {
				if (!sDone || !sHit) {
					maybeMove.push([x, y, nxs, nys]);
				} else if (!sCollide) {
					badMove.push([x, y, nxs, nys]);
				} else {
					sMove.push([x, y, nxs, nys]);
				}
			}
			if (nxc !== x || nyc !== y) {
				if (!cDone || !cHit) {
					maybeMove.push([x, y, nxc, nyc]);
				} else if (!cCollide) {
					badMove.push([x, y, nxc, nyc]);
				} else {
					cMove.push([x, y, nxc, nyc]);
				}
			}
		}
	}

	drawGrid(canvas);

	drawArrows(canvas, '#C0C0C0', cMove);
	drawArrows(canvas, '#000000', sMove);
	drawArrows(canvas, '#FF00FF', maybeMove);
	drawArrows(canvas, '#FF0000', badMove);
}

function drawArrows(canvas, color, moves) {
	if (moves.length <= 0) {
		return;
	}
	const {cw, ch, width, height} = getSizes(canvas);
	const {posX, posY} = getPosition();
	const ofsX = Math.ceil(cw / 2), ofsY = Math.ceil(ch / 2);
	const arrSz = Math.ceil(cw / 3);
	const ptSz = Math.ceil(cw / 4);

	const ctx = canvas.getContext('2d');
	ctx.save();
	// Add a clipping region since we don't check bounds later.
	ctx.beginPath();
	ctx.rect(0, 0, width, height);
	ctx.clip();

	ctx.imageSmoothingEnabled = true;
	ctx.lineWidth = 1;
	ctx.strokeStyle = color;
	ctx.fillStyle = color;

	for (let m of moves) {

		const dx = (m[0]-m[2])*cw, dy = (m[1]-m[3])*ch;
		const phi = Math.atan2(dy, dx);
		const r = Math.sqrt(dx*dx + dy*dy);

		ctx.save();

		ctx.translate((m[2]-posX)*cw+ofsX, (m[3]-posY)*ch+ofsY);
		ctx.rotate(phi);

		ctx.beginPath();
		ctx.ellipse(r, 0, ptSz, ptSz, 0, 0, 2*Math.PI);
		ctx.fill();

		ctx.beginPath();
		ctx.moveTo(r, 0);
		ctx.lineTo(0, 0);
		ctx.lineTo(arrSz, -arrSz);
		ctx.lineTo(arrSz, arrSz);
		ctx.lineTo(0, 0);
		ctx.fill();
		ctx.stroke();

		ctx.restore();
	}

	ctx.restore();
}

for (let id of ['carry', 'zero', 'sign', 'overflow']) {
	const canvas = document.getElementById(id);
	drawBG(canvas);
	drawGrid(canvas);
}

document.getElementById('run').addEventListener('click', function(e) {
	console.log('running program');

	const text = document.getElementById('program');
	text.focus();

	const p = new Parser(text.value);
	try {
		p.parse();
	} catch (e) {
		console.error(e);
		alert(e);
		return;
	}
	//console.log(p.program);
	//console.log(p.labels);

	const {error} = getPosition();
	if (error !== null) {
		console.error(error);
		alert(error);
		return;
	}

	runGrid('carry', 'bcs', 'bcc', p.program);
	runGrid('zero', 'beq', 'bne', p.program);
	runGrid('sign', 'bmi', 'bpl', p.program);
	runGrid('overflow', 'bvs', 'bvc', p.program);
}, false);
