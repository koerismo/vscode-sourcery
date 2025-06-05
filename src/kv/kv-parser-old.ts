const C_QUOTE	= 34,	S_QUOTE		= '"',
	C_STAR		= 42,	S_STAR		= '*',
	C_SLASH		= 47,	S_SLASH		= '/',
	C_BOPEN		= 123,	S_BOPEN		= '{',
	C_BCLOSE	= 125,	S_BCLOSE	= '}',
	C_SQOPEN	= 91,	S_SQOPEN	= '[',
	C_SQCLOSE	= 93,	S_SQCLOSE	= ']',
	C_ESCAPE	= 92,	S_ESCAPE	= '\\',
	C_LN		= 10,	S_LN		= '\n';

function is_plain( code: number ) {
	return (
		( code > 32 && code < 92 ) ||
		( code > 92 && code < 125 )
	);
}


export type ValueType = string | number | boolean;

function parse_value(value: string): ValueType {
	if (value === 'true') return true;
	if (value === 'false') return false;
	const num = +value;
	if (isNaN(num)) return value;
	return num;
}

function is_term(code: number) {
	return (
		code === 32 || code === 9 || code === 13 || code === C_LN ||
		code === C_BOPEN || code === C_BCLOSE );
}

export const enum ParseErrors {
	InvalidError,
	MissingValue,
	MissingKey,
	UnclosedBracket,
	ExtraBracket,
	UnclosedQuote,
	UnclosedComment,
}

export const enum KeyState {
	HasNone,
	HasKey,
	HasValue,
	HasQuery,
}

export interface ParseOptions {
	on_key:		(start: number, end: number) => void;
	on_value:	(start: number, end: number) => void;
	on_query:	(start: number, end: number) => void;
	on_enter:	(start: number) => void;
	on_exit:	(start: number) => void;
	on_error:   (start: number, end: number, err: ParseErrors) => void;
	on_comment: (start: number, end: number, ml: boolean) => void;
	escapes:	boolean;
	multilines:	boolean;
	types:      boolean;
	
	state_cancel: boolean;
	// state_pos?:	number;
	// state_key?:	KeyState;
}

/** Parses the given string and calls the provided callbacks as they are processed. */
export function tokenize(text: string, options: ParseOptions): void {
	const no_escapes    = !options.escapes;
	const length	    = text.length;

	let word_start = 0;
	let word_end = 0;

	let key_state: KeyState = KeyState.HasNone;
	let i = 0;

	// if (options.state_key !== undefined) key_state = options.state_key;
	// if (options.state_pos !== undefined) i = options.state_pos;

	m: for ( ; i<length; i++ ) {
		if (options.state_cancel) return;

		const c = text.charCodeAt(i);
		const escaped = !no_escapes && text.charCodeAt(i-1) === C_ESCAPE;

		// Spacing ( tab, space, \r, \n )
		if ( c === 32 || c === 9 || c === 13 || c === C_LN ) continue;

		// Start bracket
		if ( c === C_BOPEN && !escaped ) {
			if ( key_state !== KeyState.HasKey ) options.on_error(word_end, i, ParseErrors.MissingKey);
			key_state = KeyState.HasNone;
			options.on_enter( i );
			continue;
		}

		// End bracket
		if ( c === C_BCLOSE && !escaped ) {
			if ( key_state === KeyState.HasKey ) options.on_error(word_end, i, ParseErrors.MissingValue);
			key_state = KeyState.HasNone;
			options.on_exit( i );
			continue;
		}

		// Quoted string
		if ( c === C_QUOTE && !escaped ) {
			word_start = i+1;

			while (true) {
				const endquote = text.indexOf(S_QUOTE, i+1);
				if (endquote === -1) {
					options.on_error(word_start, i, ParseErrors.UnclosedQuote);
					continue m;
				}
				i = endquote;
				if (no_escapes || text.charCodeAt(i-1) !== C_ESCAPE) break;
			}

			word_end = i;

			if ( key_state === KeyState.HasKey ) {
				options.on_value( word_start, word_end );
				key_state = KeyState.HasValue;
			}
			else {
				options.on_key( word_start, word_end );
				key_state = KeyState.HasKey;
			}

			continue;
		}

		// Single-line comment ( // )
		if ( c  === C_SLASH && text.charCodeAt(i+1) === C_SLASH ) {
			const start = i;
			i = text.indexOf(S_LN, i+1);
			const end = i === -1 ? text.length : i;
			options.on_comment( start, end, false );
			if ( i === -1 ) break;
			continue;
		}

		// Multi-line comment ( /* )
		if ( options.multilines && c === C_SLASH && text.charCodeAt(i+1) === C_STAR ) {
			word_start = i;
			while (true) {
				const endstar = text.indexOf(S_STAR, i+1);
				if ( endstar === -1 ) {
					options.on_comment( word_start, text.length, true );
					options.on_error( word_start, word_start+2, ParseErrors.UnclosedComment );
					break m;
				}
				i = endstar;
				if ( text.charCodeAt(i+1) === C_SLASH ) break;
			}

			i += 2;
			word_end = i;
			options.on_comment( word_start, word_end, true );
			continue;
		}

		// Non-quoted string
		if ( is_plain(c) ) {
			word_start = i;

			while (i < length) {
				i++;
				if ( is_term(text.charCodeAt(i)) && (no_escapes || text.charCodeAt(i-1) !== C_ESCAPE) ) break;
			}

			word_end = i;

			if ( key_state === KeyState.HasKey ) {
				options.on_value( word_start, word_end );
				key_state = KeyState.HasValue;
			}
			else if ( key_state === KeyState.HasValue && text.charCodeAt(word_start) === C_SQOPEN && text.charCodeAt(word_end-1) === C_SQCLOSE ) {
				options.on_query( word_start, word_end );
				key_state = KeyState.HasQuery;
			}
			else {
				options.on_key( word_start, word_end );
				key_state = KeyState.HasKey;
			}
		}
	}

	if ( key_state === KeyState.HasKey ) {
		options.on_error( word_start!, word_end, ParseErrors.MissingValue );
	}

	return;
}
