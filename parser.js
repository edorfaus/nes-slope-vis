'use strict';

class Parser {
	constructor(str) {
		this.lines = str.split('\n');
		this.program = [];
		this.labels = new Map();
		this._currentGlobalLabel = '';
		this._anonLabelCounter = 0;
	}

	parse() {
		this._pass1();
		this._pass2();
		this._pass3();
	}

	_error(li, str) {
		return new Error('line '+(li+1)+': '+str);
	}

	// First pass: parse lines, check labels, opcodes, args/addr modes
	_pass1() {
		const labelRE = /^(\S*?):\s*(.*)$/
		const lines = this.lines;
		for (let li = 0; li < lines.length; li++) {
			// Remove comments, and trim spaces
			let line = lines[li].split(';', 1)[0].trim();
			if (line === '') {
				continue;
			}
			// Handle labels
			for (let r = labelRE.exec(line); r !== null;) {
				this._addLabel(li, r[1]);
				line = r[2];
				r = labelRE.exec(line);
			}
			if (line == '') {
				continue;
			}
			// Handle opcode and arguments (if any)
			const opcode = line.split(/\s/, 1)[0].toLowerCase();
			const instr = instructions[opcode];
			if (instr !== Object(instr)) {
				throw this._error(li, 'unknown instruction: '+opcode);
			}
			const args = line.substring(opcode.length).trim();
			const am = this._addrMode(li, opcode, args);
			if (!instr.modes.includes(am[0])) {
				throw this._error(
					li, am[0].name+' mode is not supported by '+opcode
				);
			}
			// Add to program
			this.program.push([li, 'op', opcode, ...am]);
		}
	}

	// For pass 1: check and add a label to the program.
	_addLabel(li, lbl) {
		if (!/^([@_a-z][@_a-z0-9]*)?$/i.test(lbl)) {
			throw this._error(li, 'invalid label: "'+lbl+'"');
		}
		if (lbl === '') {
			// Anonymous label
			this._anonLabelCounter++;
			const globalized = 'anon#' + this._anonLabelCounter;
			this.labels.set(globalized, this.program.length);
			this.program.push([li, 'labelAnon', globalized]);
			return;
		}
		if (lbl.startsWith('@')) {
			// Local label
			const globalized = lbl + '#' + this._currentGlobalLabel;
			if (this.labels.has(globalized)) {
				throw this._error(li, 'duplicate local label: '+lbl);
			}
			this.labels.set(globalized, this.program.length);
			this.program.push([li, 'labelLocal', globalized, lbl]);
			return;
		}
		// Global label
		if (this.labels.has(lbl)) {
			throw this._error(li, 'duplicate label: '+lbl);
		}
		this.labels.set(lbl, this.program.length);
		this.program.push([li, 'labelGlobal', lbl]);
		this._currentGlobalLabel = lbl;
	}

	// For pass 2: find the referenced label.
	_findLabelRef(pi, lbl) {
		const li = this.program[pi][0];
		if (!/^([@_a-z][@_a-z0-9]*|[:].*)$/i.test(lbl)) {
			throw this._error(li, 'invalid label: "'+lbl+'"');
		}
		if (lbl.startsWith('@')) {
			// Local label
			const globalized = lbl + '#' + this._currentGlobalLabel;
			if (!this.labels.has(globalized)) {
				throw this._error(li, 'unknown local label: '+lbl);
			}
			const lpi = this.labels.get(globalized);
			if (lpi < 0 || lpi >= this.program.length) {
				// Should never happen, indicates a bug elsewhere.
				throw this._error(li, 'bad globalized label id: OOR');
			}
			const lp = this.program[lpi];
			if (lp[1] !== 'labelLocal') {
				// Should never happen, indicates a bug elsewhere.
				throw this._error(li, 'bad globalized label id: !local');
			}
			if (lp[2] !== globalized || lp[3] !== lbl) {
				throw this._error(li, 'wrong globalized label found');
			}
			return globalized;
		}
		if (!lbl.startsWith(':')) {
			// Global label
			if (!this.labels.has(lbl)) {
				throw this._error(li, 'unknown label: '+lbl);
			}
			const lpi = this.labels.get(lbl);
			if (lpi < 0 || lpi >= this.program.length) {
				// Should never happen, indicates a bug elsewhere.
				throw this._error(li, 'bad global label id: OOR');
			}
			const lp = this.program[lpi];
			if (lp[1] !== 'labelGlobal') {
				// Should never happen, indicates a bug elsewhere.
				throw this._error(li, 'bad global label id: !global');
			}
			if (lp[2] !== lbl) {
				throw this._error(li, 'wrong global label found');
			}
			return lbl;
		}
		// Anonymous label
		if (lbl === ':') {
			throw this._error(li, 'anon label ref must have direction');
		}
		if (!/^:[+-]+$/.test(lbl)) {
			throw this._error(li, 'invalid character in anon label ref');
		}
		if (!/^:([+]+|[-]+)$/.test(lbl)) {
			throw this._error(li, 'mixed directions in anon label ref');
		}
		let steps = lbl.length - 1
		const program = this.program;

		let lpi = pi;
		if (lbl.startsWith(':+')) {
			for (lpi++; steps > 0 && lpi < program.length; lpi++) {
				if (program[lpi][1] === 'labelAnon') {
					steps--;
				}
			}
			lpi--;
		} else {
			for (lpi--; steps > 0 && lpi >= 0; lpi--) {
				if (program[lpi][1] === 'labelAnon') {
					steps--;
				}
			}
			lpi++;
		}
		if (steps !== 0) {
			throw this._error(li, 'bad anon label ref: label not found');
		}
		if (lpi < 0 || lpi >= this.program.length) {
			// Should never happen, indicates a bug elsewhere.
			throw this._error(li, 'bad anon label id: OOR');
		}
		const lp = this.program[lpi];
		if (lp[1] !== 'labelAnon') {
			// Should never happen, indicates a bug elsewhere.
			throw this._error(li, 'bad anon label id: !anon');
		}
		const globalized = lp[2];
		const glpi = this.labels.get(globalized);
		if (glpi !== lpi) {
			// Should never happen, indicates a bug elsewhere.
			throw this._error(li, 'bad globalized label id: mismatch');
		}
		return globalized;
	}

	// For pass 1: determine the address mode from the arguments.
	_addrMode(li, opcode, str) {
		if (str === '') {
			return [Implicit];
		}

		if (str === 'A' || str === 'a') {
			return [Acc];
		}
		if (str === 'X' || str === 'x' || str === 'Y' || str === 'y') {
			throw this._error(li, 'bad addressing mode: wrong register');
		}

		if (str.startsWith('#')) {
			if (str === '#') {
				throw this._error(li, 'bad immediate: missing value');
			}
			return [Imm, str.substring(1)];
		}

		if (str.startsWith('(')) {
			throw this._error(
				li, 'indirect addressing modes are not (yet?) supported'
			);
			// Indir, IndirX, IndirY
		}

		const parts = str.split(/\s*,\s*/);
		if (parts.length > 2) {
			throw this._error(li, 'too many arguments (above 2)');
		}
		if (parts.length > 1) {
			const ind = parts[1].toLowerCase()
			if (ind !== 'x' && ind !== 'y') {
				throw this._error(li, 'invalid indexed addressing mode');
			}
			throw this._error(
				li, 'indexed addressing modes are not (yet?) supported'
			);
			// ZPX, ZPY, AbsX, AbsY
		}

		// ZP, Abs, Rel
		const instr = instructions[opcode];
		if (instr.modes.includes(Rel)) {
			return [Rel, str];
		}
		if (instr.modes.includes(Abs)) {
			return [Abs, str];
		}
		return [ZP, str];
	}

	// Second pass: resolve label names and variables
	_pass2() {
		this._currentGlobalLabel = '';
		const program = this.program;
		for (let pi = 0; pi < program.length; pi++) {
			const p = program[pi];
			if (p[1] != 'op') {
				if (p[1] === 'labelGlobal') {
					this._currentGlobalLabel = p[2];
				}
				continue;
			}
			const opcode = p[2], am = p[3];

			if (am === Imm) {
				// parse hex values and such
				p[4] = this._parseImmExpr(p[0], p[4]);
			}
			if (am === Rel) {
				// Relative - this is used for branches; resolve label.
				p[4] = this._findLabelRef(pi, p[4]);
			}
			if (am === Abs || am === ZP) {
				// Variable address; verify and handle +0, +1 etc.
				p[4] = this._parseVarExpr(p[0], p[4]);
			}
			// ZPX, ZPY, AbsX, AbsY, Indir, IndirX, IndirY
		}
	}

	// For pass 2: parse an immediate-value expression.
	_parseImmExpr(li, str) {
		if (/[+-]$/.test(str)) {
			throw this._error(li, 'invalid expression: trailing sign');
		}
		const parts = str.split(/([+-])/);
		let value = 0, op = 1;
		for (let i = 0; i < parts.length; i++) {
			const p = parts[i].trim();
			if (p === '' || p === '+') {
				continue;
			}
			if (p === '-') {
				op = -op;
				continue;
			}
			const v = this._parseNumber(li, p);
			value += op * v;
			op = 1;
		}
		return value;
	}

	// For pass 2: parse an expression involving a variable name.
	_parseVarExpr(li, str) {
		if (/[+-]$/.test(str)) {
			throw this._error(li, 'invalid expression: trailing sign');
		}
		const parts = str.split(/([+-])/);
		let value = 0, op = 1, varname = '';
		for (let i = 0; i < parts.length; i++) {
			const p = parts[i].trim();
			if (p === '' || p === '+') {
				continue;
			}
			if (p === '-') {
				op = -op;
				continue;
			}
			if (/^[a-z_][a-z0-9_]*$/i.test(p)) {
				if (varname !== '') {
					throw this._error(li, 'multiple variables in expr');
				}
				if (op !== 1) {
					throw this._error(li, 'cannot subtract variable');
				}
				varname = p;
				continue
			}
			const v = this._parseNumber(li, p);
			value += op * v;
			op = 1;
		}
		if (varname === '') {
			return value;
		}
		if (value === 0) {
			return varname;
		}
		if (value < 0) {
			return varname + value;
		}
		return varname + '+' + value;
	}

	// For pass 2: parse a string into a number (handling base etc).
	_parseNumber(li, str) {
		let num = str, neg = false, base = 10, verify = /^[0-9_]+$/;
		if (num.startsWith('-')) {
			neg = true;
			num = num.substring(1);
		} else if (num.startsWith('+')) {
			num = num.substring(1);
		}
		if (num.startsWith('$')) {
			// Hexadecimal
			base = 16;
			num = num.substring(1);
			verify = /^[0-9a-f]+$/i;
		} else if (num.startsWith('%')) {
			// Binary
			base = 2;
			num = num.substring(1);
			verify = /^[01]+$/;
		} else if (num.startsWith('0x')) {
			// Hexadecimal
			base = 16;
			num = num.substring(2);
			verify = /^[0-9a-f]+$/i;
		}
		num = num.replaceAll('_', '');
		if (!verify.test(num)) {
			throw this._error(li, 'invalid base '+base+' number: '+str);
		}
		const v = parseInt(num, base);
		return neg ? -v : v;
	}

	// Third pass: simplify the program
	_pass3() {
		// Remove the label entries, replace map values with indexes
		const newLabels = new Map();
		const newProgram = [];
		const program = this.program, labels = this.labels;
		for (let pi = 0; pi < program.length; pi++) {
			const p = program[pi];
			if (p[1] == 'op') {
				newProgram.push(p);
				continue;
			}
			const lbl = p[2];
			newLabels.set(lbl, newProgram.length);
			if (!labels.has(lbl) || labels.get(lbl) !== pi) {
				// This should never happen, indicates a bug somewhere
				throw new Error('incorrect label mapping for '+lbl);
			}
		}
		if (newLabels.size !== labels.size) {
			throw new Error(
				'different label counts: '
				+newLabels.size+' vs '+labels.size
			);
		}
		// Replace the label names with indexes in the program
		for (let pi = 0; pi < newProgram.length; pi++) {
			const p = newProgram[pi];
			const opcode = p[2], am = p[3];

			if (am === Rel) {
				const lbl = p[4];
				if (!newLabels.has(lbl)) {
					// This should never happen, indicates a bug
					throw this._error(p[0], 'p3: missing label: '+lbl);
				}
				p[4] = newLabels.get(p[4]);
			}
			// Imm, Abs, ZP
			// ZPX, ZPY, AbsX, AbsY, Indir, IndirX, IndirY
		}
		this.program = newProgram;
		this.labels = newLabels;
	}
}
