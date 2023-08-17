'use strict';

// Addressing modes
const Implicit = { name: 'implicit' };
const Acc = {
	name: 'accumulator',
	load: (c, i) => c.RegA,
	store: (c, i, v) => c.RegA = v,
};
const Imm = { name: 'immediate', load: (c, i) => i[4] };
const ZP = {
	name: 'ZP',
	load: (c, i) => c.Vars.has(i[4]) ? c.Vars.get(i[4]) : 0,
	store: (c, i, v) => c.Vars.set(i[4], v),
};
const ZPX = { name: 'ZP,X' };
const ZPY = { name: 'ZP,Y' };
const Rel = { name: 'relative' };
const Abs = { name: 'absolute', load: ZP.load, store: ZP.store };
const AbsX = { name: 'absolute,X' };
const AbsY = { name: 'absolute,Y' };
const Indir = { name: 'indirect' };
const IndirX = { name: 'indirect,X' };
const IndirY = { name: 'indirect,Y' };

const instructions = {
	'adc': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => c.adc(i[3].load(c, i)),
	},
	'and': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => c.setA(c.RegA & i[3].load(c, i)),
	},
	'asl': {
		modes: [Acc, ZP, ZPX, Abs, AbsX],
		exec: (c, i) => {
			const v = i[3].load(c, i) << 1;
			c.FCarry = v > 255 ? 1 : 0;
			i[3].store(c, i, byte(v));
			c.setZN(v);
		},
	},
	'bcc': {modes: [Rel], exec: (c, i) => c.branch(!c.FCarry, i[4])},
	'bcs': {modes: [Rel], exec: (c, i) => c.branch(c.FCarry, i[4])},
	'beq': {modes: [Rel], exec: (c, i) => c.branch(c.FZero, i[4])},
	'bit': {
		modes: [ZP, Abs],
		exec: (c, i) => {
			const v = i[3].load(c, i);
			c.FZero = (c.RegA & v) === 0;
			c.FOverflow = (v & 0x40) !== 0;
			c.FNegative = (v & 0x80) !== 0;
		},
	},
	'bmi': {modes: [Rel], exec: (c, i) => c.branch(c.FNegative, i[4])},
	'bne': {modes: [Rel], exec: (c, i) => c.branch(!c.FZero, i[4])},
	'bpl': {modes: [Rel], exec: (c, i) => c.branch(!c.FNegative, i[4])},
	//'brk': {modes: [Implicit], exec: (c, i) => c.jsr(true, i[4])},
	'bvc': {modes: [Rel], exec: (c, i) => c.branch(!c.FOverflow, i[4])},
	'bvs': {modes: [Rel], exec: (c, i) => c.branch(c.FOverflow, i[4])},
	'clc': {modes: [Implicit], exec: (c, i) => c.FCarry = 0},
	'cld': {modes: [Implicit], exec: (c, i) => {}},
	'cli': {modes: [Implicit], exec: (c, i) => {}},
	'clv': {modes: [Implicit], exec: (c, i) => c.FOverflow = false},
	'cmp': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => c.compare(c.RegA, i[3].load(c, i)),
	},
	'cpx': {
		modes: [Imm, ZP, Abs],
		exec: (c, i) => c.compare(c.RegX, i[3].load(c, i)),
	},
	'cpy': {
		modes: [Imm, ZP, Abs],
		exec: (c, i) => c.compare(c.RegY, i[3].load(c, i)),
	},
	'dec': {
		modes: [ZP, ZPX, Abs, AbsX],
		exec: (c, i) => {
			const v = byte(i[3].load(c, i) - 1);
			i[3].store(c, i, v);
			c.setZN(v);
		},
	},
	'dex': {modes: [Implicit], exec: (c, i) => c.setX(c.RegX - 1)},
	'dey': {modes: [Implicit], exec: (c, i) => c.setY(c.RegY - 1)},
	'eor': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => c.setA(c.RegA ^ i[3].load(c, i)),
	},
	'inc': {
		modes: [ZP, ZPX, Abs, AbsX],
		exec: (c, i) => {
			const v = byte(i[3].load(c, i) + 1);
			i[3].store(c, i, v);
			c.setZN(v);
		},
	},
	'inx': {modes: [Implicit], exec: (c, i) => c.setX(c.RegX + 1)},
	'iny': {modes: [Implicit], exec: (c, i) => c.setY(c.RegY + 1)},
	'jmp': {
		// This "abuses" Rel because we need a label and don't actually
		// distinguish between relative and absolute jump targets.
		modes: [Rel/*Abs, Indir*/],
		exec: (c, i) => c.branch(true, i[4]),
	},
	// This "abuses" Rel because we need a label here.
	'jsr': {modes: [Rel/*Abs*/], exec: (c, i) => c.jsr(false, i[4])},
	'lda': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => c.setA(i[3].load(c, i)),
	},
	'ldx': {
		modes: [Imm, ZP, ZPY, Abs, AbsY],
		exec: (c, i) => c.setX(i[3].load(c, i)),
	},
	'ldy': {
		modes: [Imm, ZP, ZPX, Abs, AbsX],
		exec: (c, i) => c.setY(i[3].load(c, i)),
	},
	'lsr': {
		modes: [Acc, ZP, ZPX, Abs, AbsX],
		exec: (c, i) => {
			let v = i[3].load(c, i);
			c.FCarry = v & 1;
			v = byte(v >> 1);
			i[3].store(c, i, v);
			c.setZN(v);
		},
	},
	'nop': {modes: [Implicit], exec: (c, i) => {}},
	'ora': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => c.setA(c.RegA | i[3].load(c, i)),
	},
	'pha': {modes: [Implicit], exec: (c, i) => c.push(c.RegA)},
	'php': {modes: [Implicit], exec: (c, i) => c.pushFlags()},
	'pla': {modes: [Implicit], exec: (c, i) => c.setA(c.pop())},
	'plp': {modes: [Implicit], exec: (c, i) => c.popFlags()},
	'rol': {
		modes: [Acc, ZP, ZPX, Abs, AbsX],
		exec: (c, i) => {
			const v = (i[3].load(c, i) << 1) | c.FCarry;
			c.FCarry = v > 255 ? 1 : 0;
			i[3].store(c, i, byte(v));
			c.setZN(v);
		},
	},
	'ror': {
		modes: [Acc, ZP, ZPX, Abs, AbsX],
		exec: (c, i) => {
			let v = i[3].load(c, i) | (c.FCarry === 0 ? 0 : 0x100);
			c.FCarry = v & 1;
			v = byte(v >> 1);
			i[3].store(c, i, v);
			c.setZN(v);
		},
	},
	'rti': {modes: [Implicit], exec: (c, i) => {c.popFlags(); c.rts()}},
	'rts': {modes: [Implicit], exec: (c, i) => c.rts()},
	'sbc': {
		modes: [Imm, ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		// binary mode sbc is the same as adc with an inverted argument.
		exec: (c, i) => c.adc(i[3].load(c, i) ^ 0xFF),
	},
	'sec': {modes: [Implicit], exec: (c, i) => c.FCarry = 1},
	'sed': {modes: [Implicit], exec: (c, i) => {}},
	'sei': {modes: [Implicit], exec: (c, i) => {}},
	'sta': {
		modes: [ZP, ZPX, Abs, AbsX, AbsY, IndirX, IndirY],
		exec: (c, i) => i[3].store(c, i, c.RegA),
	},
	'stx': {
		modes: [ZP, ZPY, Abs],
		exec: (c, i) => i[3].store(c, i, c.RegX),
	},
	'sty': {
		modes: [ZP, ZPX, Abs],
		exec: (c, i) => i[3].store(c, i, c.RegY),
	},
	'tax': {modes: [Implicit], exec: (c, i) => c.setX(c.RegA)},
	'tay': {modes: [Implicit], exec: (c, i) => c.setY(c.RegA)},
	'tsx': {
		modes: [Implicit],
		exec: (c, i) => c.setX(0xFF-c.Stack.length),
	},
	'txa': {modes: [Implicit], exec: (c, i) => c.setA(c.RegX)},
	'txs': {
		modes: [Implicit],
		exec: (c, i) => {
			while (c.Stack.length < c.RegX) {
				c.Stack.push(0);
			}
			while (c.Stack.length > c.RegX) {
				c.Stack.pop();
			}
		},
	},
	'tya': {modes: [Implicit], exec: (c, i) => c.setA(c.RegY)},

	// ---- custom stuff starts here

	'branch': {
		modes: [Rel],
		exec: (c, i) => {
			let t = 'bcc';
			if (c.Vars.has('!branchType')) {
				t = c.Vars.get('!branchType');
			}
			const prePC = c.PC;
			instructions[t].exec(c, i);
			c.Vars.set('!branchHit', c.PC !== prePC);
		},
	},
};
