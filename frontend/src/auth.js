// Front-end only demo accounts (no backend yet).
export const ROLES = {
  coordinator: { label: 'Timetable Coordinator', hint: 'Enter data, review and approve' },
  faculty: { label: 'Faculty Member', hint: 'View your timetable' },
  student: { label: 'Student', hint: 'View timetable' },
}
export const DEMO = {
  coordinator: { username: 'coordinator', password: 'admin123' },
  faculty: { username: 'faculty', password: 'faculty123' },
  student: { username: 'student', password: 'student123' },
}
export function checkLogin(role, username, password) {
  const d = DEMO[role]
  return d && d.username === username.trim() && d.password === password
}
