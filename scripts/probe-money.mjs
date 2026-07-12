// Throwaway probe for money edge cases (banker's rounding ties incl. negatives).
import { bankersRound, toMoney, toCents, fromCents, parseCsvMoney, sameMoney, allocateByPercent } from '../packages/shared/src/money.js'
const cases = [0.015, 0.025, 0.035, 0.045, 1.005, 2.005, -0.015, -0.025, -0.035, -0.045, -1.005, 0.1 + 0.2, 0.105, 2.5, 3.5]
for (const c of cases) {
  console.log(`toMoney(${c}) = ${toMoney(c)}  toCents=${toCents(c)}  bankersRound(${c * 100})=${bankersRound(c * 100)}`)
}
console.log('parseCsvMoney("1.234,56")=', parseCsvMoney('1.234,56'))
console.log('parseCsvMoney("1,234.56")=', parseCsvMoney('1,234.56'))
console.log('parseCsvMoney("12,50")=', parseCsvMoney('12,50'))
console.log('parseCsvMoney("1234.56")=', parseCsvMoney('1234.56'))
console.log('parseCsvMoney("abc")=', parseCsvMoney('abc'))
console.log('parseCsvMoney("")=', parseCsvMoney(''))
console.log('sameMoney(0.1+0.2, 0.3)=', sameMoney(0.1 + 0.2, 0.3), '(expect true)')
console.log('allocateByPercent(100, [33.33,33.33,33.34])=', allocateByPercent(100, [33.33, 33.33, 33.34]).reduce((s, x) => s + x, 0), 'cents (expect 10000)')
