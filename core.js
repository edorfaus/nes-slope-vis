'use strict';

const byte = v => {
	if (v < 0) {
		return 256 - ((-v) % 256);
	}
	return v % 256;
};

class Core {
	constructor(program) {
		this.RegA = 0;
		this.RegX = 0;
		this.RegY = 0;
		this.FCarry = 0;
		this.FZero = true;
		this.FOverflow = false;
		this.FNegative = false;
		this.Vars = new Map();
		this.Stack = [];
		this.Program = program;
		this.PC = 0;
	}
	setA(v) {
		this.RegA = byte(v);
		this.setZN(v);
	}
	setX(v) {
		this.RegX = byte(v);
		this.setZN(v);
	}
	setY(v) {
		this.RegY = byte(v);
		this.setZN(v);
	}
	// setZN sets the FZero and FNegative flags according to the value.
	setZN(v) {
		v = byte(v);
		this.FZero = v == 0;
		this.FNegative = v > 127;
	}
	push(v) {
		this.Stack.push(v);
	}
	pop() {
		if (this.Stack.length > 0) {
			return this.Stack.pop();
		}
		return 0;
	}
	pushFlags() {
		this.push(0
			| (this.FNegative ? 0x80 : 0)
			| (this.FOverflow ? 0x40 : 0)
			| (this.FZero ? 0x02 : 0)
			| this.FCarry
		);
	}
	popFlags() {
		const v = this.pop();
		this.FNegative = (v & 0x80) !== 0;
		this.FOverflow = (v & 0x40) !== 0;
		this.FZero = (v & 0x02) !== 0;
		this.FCarry = v & 0x01;
	}
	compare(a, m) {
		this.FCarry = (a >= m ? 1 : 0);
		this.setZN(a - m);
	}
	adc(val) {
		// I'm not 100% sure this implementation is correct, especially
		// with regards to the flags, but it's the best I've got.
		const res = this.RegA + val + this.FCarry;
		this.FCarry = res > 255 ? 1 : 0;
		this.FOverflow = ((this.RegA ^ res) & (val ^ res) & 0x80) !== 0;
		this.setA(res);
	}
	jsr(brk, dest) {
		const pc = this.PC + (brk ? 1 : 0);
		this.push(pc >> 8);
		this.push(pc & 0xFF);
		if (brk) {
			this.pushFlags();
		}
		this.PC = dest;
	}
	rts() {
		if (this.Stack.length < 2) {
			// Return from outermost (initial) routine: exit the run.
			this.PC = this.Program.length;
			return;
		}
		const low = this.pop();
		const high = this.pop();
		this.PC = high * 0x100 + low;
	}
	branch(cond, dest) {
		if (cond) {
			this.PC = dest;
		}
	}
	run() {
		let allowedTicks = 1024;
		const program = this.Program;
		while (this.PC < program.length && allowedTicks > 0) {
			const i = program[this.PC];
			this.PC++;
			instructions[i[2]].exec(this, i);
			allowedTicks--;
		}
		if (this.PC < program.length && allowedTicks <= 0) {
			console.warn('Ran out of ticks for the program; aborted.');
			return false;
		}
		return true;
	}
}
