import { formatMoney, toPaisa } from './money';

test('toPaisa: valid input', () => {
  expect(toPaisa('45,000.50')).toBe(4500050);
  expect(toPaisa('1,23,456')).toBe(12345600); // Pakistani grouping
  expect(toPaisa(' 100 ')).toBe(10000);
  expect(toPaisa('100')).toBe(10000);
  expect(toPaisa('100.')).toBe(10000);
  expect(toPaisa('99.5')).toBe(9950);
  expect(toPaisa('19.99')).toBe(1999); // would be 1998.99999 with float math
  expect(toPaisa('0.07')).toBe(7);
  expect(toPaisa('.5')).toBe(50);
  expect(toPaisa('.05')).toBe(5);
});

test('toPaisa: invalid input is null', () => {
  for (const bad of ['', '   ', '0', '0.00', '.0', '-5', '-0.50', '+5', '1.234', '1.2.3', '.', ',', 'abc', '12a', 'Rs 100', '1e5', '1/2']) {
    expect(toPaisa(bad)).toBeNull();
  }
});

test('toPaisa: very large numbers', () => {
  expect(toPaisa('90,071,992,547,409')).toBe(9007199254740900); // largest whole rupee amount that stays a safe integer
  expect(toPaisa('90071992547410')).toBeNull(); // would exceed Number.MAX_SAFE_INTEGER paisa
  expect(toPaisa('9007199254740993')).toBeNull();
  expect(toPaisa('9'.repeat(400))).toBeNull(); // Infinity
});

test('formatMoney: grouping and decimals', () => {
  expect(formatMoney(0)).toBe('Rs 0');
  expect(formatMoney(5)).toBe('Rs 0.05');
  expect(formatMoney(50)).toBe('Rs 0.50');
  expect(formatMoney(99900)).toBe('Rs 999');
  expect(formatMoney(100000)).toBe('Rs 1,000');
  expect(formatMoney(4500000)).toBe('Rs 45,000');
  expect(formatMoney(4500050)).toBe('Rs 45,000.50');
  expect(formatMoney(12345600)).toBe('Rs 1,23,456');
  expect(formatMoney(123456700)).toBe('Rs 12,34,567');
  expect(formatMoney(1234567800)).toBe('Rs 1,23,45,678');
});

test('formatMoney: negative and very large', () => {
  expect(formatMoney(-300000)).toBe('-Rs 3,000');
  expect(formatMoney(-5)).toBe('-Rs 0.05');
  expect(formatMoney(9007199254740900)).toBe('Rs 9,00,71,99,25,47,409');
});

test('toPaisa and formatMoney round-trip', () => {
  for (const paisa of [1, 99, 100, 4500050, 123456789]) {
    expect(toPaisa(formatMoney(paisa).replace('Rs ', ''))).toBe(paisa);
  }
});
