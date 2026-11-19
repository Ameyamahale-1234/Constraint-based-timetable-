import { useEffect, useState } from 'react'

// E1 data entities. Each has a storage key and form fields.
// Fields marked optional may be left empty (the engines use sensible defaults).
export const ENTITIES = {
  courses: {
    title: 'Courses',
    hint: 'Hours / week: theory = credits (one 1-hour class per credit); lab = lab length in hours (1, 2 or 3).',
    fields: [
      { key: 'code', label: 'Code', type: 'text' },
      { key: 'name', label: 'Course name', type: 'text' },
      { key: 'type', label: 'Type', type: 'select', options: ['Theory', 'Lab', 'Project'] },
      { key: 'hours', label: 'Hours / week', type: 'number' },
    ],
  },
  faculty: {
    title: 'Faculty',
    hint: 'The name is used to refer to the teacher in Teaching Assignments.',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dept', label: 'Department', type: 'text', optional: true },
      { key: 'maxHours', label: 'Max hours / week', type: 'number', optional: true },
    ],
  },
  rooms: {
    title: 'Rooms & Labs',
    fields: [
      { key: 'name', label: 'Room name', type: 'text' },
      { key: 'type', label: 'Type', type: 'select', options: ['Classroom', 'Lab'] },
      { key: 'capacity', label: 'Capacity', type: 'number', optional: true },
    ],
  },
  divisions: {
    title: 'Divisions & Batches',
    hint: 'Division names must be unique (for example 4A and 6A when two semesters both have a division A).',
    fields: [
      { key: 'name', label: 'Division', type: 'text' },
      { key: 'semester', label: 'Semester', type: 'text', optional: true },
      { key: 'batches', label: 'Batches (comma separated)', type: 'text' },
      { key: 'strength', label: 'Strength', type: 'number', optional: true },
    ],
  },
  slots: {
    title: 'Time Slots',
    hint: 'Class periods of the college. Leave this page empty to use the default periods (08:00–17:45, lunch 12:30–13:30, Saturday until 12:15).',
    fields: [
      { key: 'day', label: 'Day', type: 'select', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
      { key: 'start', label: 'Start', type: 'time' },
      { key: 'end', label: 'End', type: 'time' },
    ],
  },
  assignments: {
    title: 'Teaching Assignments',
    hint: 'Who teaches which course to which divisions. Divisions: "4A, 4B"; for one lab batch write division:batch, e.g. "4A:A1". The course is offered to every division listed here.',
    fields: [
      { key: 'course', label: 'Course code', type: 'text' },
      { key: 'faculty', label: 'Teacher (faculty name)', type: 'text' },
      { key: 'divisions', label: 'Divisions / batches', type: 'text' },
    ],
  },
}

// Simple persistent state (browser localStorage) - replaced by a real DB later.
export function useStored(key, initial = []) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem('tt2_' + key)
      return raw ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem('tt2_' + key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}

/** All E1 data as one object (what is sent to the engines). */
export function collectE1(stores) {
  return Object.fromEntries(Object.keys(ENTITIES).map((k) => [k, stores[k][0].map(({ id: _id, ...rest }) => rest)]))
}
