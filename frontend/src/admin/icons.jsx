import {
  Activity, ArrowDown, ArrowUp, Bookmark, Check, ChevronDown, ChevronRight, Download, Ellipsis, ExternalLink, Folder, FolderInput, FolderPlus, Globe, History,
  Images, Landmark, LayoutDashboard, Mail, ListFilter, LogOut, Menu, Moon, Newspaper, PanelLeft, Pencil, Plus, Search, ShieldCheck, Star, Sun, Trash2, TriangleAlert,
  Users, UsersRound, X,
} from 'lucide-react'

// One icon library, one stroke weight. Names describe the idea, not the shape.
const MAP = {
  dashboard: LayoutDashboard, activity: Activity, users: Users, committee: UsersRound, shield: ShieldCheck, landmark: Landmark, blog: Newspaper, gallery: Images,
  star: Star, folder: Folder, folderPlus: FolderPlus, folderMove: FolderInput, chevron: ChevronRight, chevronDown: ChevronDown, search: Search, filter: ListFilter,
  external: ExternalLink, plus: Plus, x: X, bookmark: Bookmark, clock: History, download: Download, menu: Menu, panel: PanelLeft, logout: LogOut, moon: Moon, sun: Sun,
  mail: Mail, globe: Globe, check: Check, alert: TriangleAlert, more: Ellipsis, pencil: Pencil, trash: Trash2, up: ArrowUp, down: ArrowDown,
}

export default function AdminIcon({ name, size = 16, className = '' }) {
  const Cmp = MAP[name] || Folder
  return <Cmp className={`ad-icon ${className}`} size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />
}

// A small tinted tile behind a section icon; the tint recognises the area, it is never the only cue (the label is always there).
export const TONES = { dashboard: 'slate', activity: 'slate', users: 'indigo', committee: 'violet', shield: 'rose', landmark: 'teal', blog: 'amber', gallery: 'sky', mail: 'sky', star: 'gold', folder: 'slate' }

export function NavIcon({ name, tone, size = 15 }) {
  return <span className={`ni ni-${tone || TONES[name] || 'slate'}`}><AdminIcon name={name} size={size} /></span>
}
