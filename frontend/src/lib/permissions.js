export function canManage(user) {
  return user?.role === 'ADMIN' || user?.role === 'STAFF';
}

export function isAdmin(user) {
  return user?.role === 'ADMIN';
}

export function isViewer(user) {
  return user?.role === 'VIEWER';
}
