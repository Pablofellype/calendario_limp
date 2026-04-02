import {
  createIcons,
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Server,
  Share,
  Share2,
  ShieldCheck,
  Trash,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';

const LUCIDE_ICONS = {
  AlertTriangle,
  ArrowRight,
  Bell,
  BellOff,
  Camera,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Server,
  Share,
  Share2,
  ShieldCheck,
  Trash,
  Trash2,
  UserCheck,
  Users,
  X,
};

// Keep lucide.createIcons() working (HTML uses data-lucide=...)
window.lucide = window.lucide || {};
window.lucide.createIcons = () => createIcons({ icons: LUCIDE_ICONS });

export { gsap, confetti };




