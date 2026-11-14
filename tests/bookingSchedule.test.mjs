import test from 'node:test'
import assert from 'node:assert/strict'
import { getDayFromDateValue, getReservationTimeSlots, getTodayDateValue, isBookableDate } from '../src/lib/scheduleExceptions.js'
const today = '2026-11-14'
test('booking calendar rejects malformed, rolled-over, past and closed dates', () => {
  for (const date of ['', '2026-02-30', '2026-13-01', '2026-1-01', 'junk']) {
    assert.equal(getDayFromDateValue(date), null)
    assert.deepEqual(getReservationTimeSlots(date, today), [])
  }
  for (const date of ['2026-11-13', '2026-11-17', '2026-11-18', '2026-12-25', '2027-01-01']) assert.equal(isBookableDate(date, today), false)
  assert.equal(getDayFromDateValue('2028-02-29'), 2)
})
test('normal and holiday slots follow the same calendar', () => {
  assert.equal(getReservationTimeSlots('2026-11-14', today).at(-1), '22:45')
  assert.equal(getReservationTimeSlots('2026-11-15', today).at(-1), '22:30')
  for (const date of ['2026-12-24', '2026-12-31']) {
    const slots = getReservationTimeSlots(date, today)
    assert.equal(slots[0], '13:00'); assert.equal(slots.at(-1), '17:45')
    assert.equal(slots.includes('19:30'), false)
  }
  assert.equal(getTodayDateValue(new Date('2026-07-01T23:30:00Z')), '2026-07-02')
  assert.equal(getTodayDateValue(new Date('2026-12-01T23:30:00Z')), '2026-12-01')
})
