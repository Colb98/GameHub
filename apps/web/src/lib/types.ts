export interface GameCard {
  id: string;
  slug: string;
  category: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';
  name: string;
  shortIntro: string;
  playCount: number;
  ratingAvg: number;
  ratingCount: number;
  releaseDate: string | null;
  featuredRank: number | null;
  bannerPath: string | null;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface GameDetail extends GameCard {
  scoreOrder: 'DESC' | 'ASC';
  maxScore: number | null;
  developerName: string;
  controlsHtml: string;
  screenshots: { id: string; path: string; altText: string | null }[];
  activeVersion: { semver: string; path: string } | null;
  isFavorite: boolean;
  myRating: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
  createdAt: string;
}

export interface LeaderboardResponse {
  period: string;
  scoreOrder: 'DESC' | 'ASC';
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

export type Role = 'PLAYER' | 'DEVELOPER' | 'MODERATOR' | 'ADMIN';

export type DeveloperRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DeveloperRequest {
  status: DeveloperRequestStatus;
  message: string | null;
  reviewReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  hasPassword: boolean;
  /** The user's latest developer-role application, if they ever made one */
  developerRequest: DeveloperRequest | null;
}

export interface AdminDeveloperRequest {
  id: string;
  message: string | null;
  reviewReason: string | null;
  createdAt: string;
  user: { id: string; displayName: string; email: string | null; role: Role };
}

export interface SubmitScoreResult {
  scoreId: string;
  score: number;
  name: string;
  rank: number;
  personalBest: number | null;
}

export interface StudioGame {
  id: string;
  slug: string;
  status: string;
  category: string;
  orientation: 'LANDSCAPE' | 'PORTRAIT' | 'BOTH';
  scoreOrder: 'DESC' | 'ASC';
  maxScore: number | null;
  rejectReason: string | null;
  /** Set while a new version of a published game awaits admin review */
  updateSubmittedAt: string | null;
  bannerPath: string | null;
  screenshots: { id: string; path: string; altText: string | null }[];
  translations: {
    locale: string;
    name: string;
    shortIntro: string;
    controlsHtml: string;
  }[];
  versions: { id: string; semver: string; isActive: boolean; bundlePath: string }[];
  developer?: { id: string; displayName: string; email: string | null };
}
