// 画面に渡す状態（ipc-contract.md 3. の AppState）を組み立て、変わったら知らせる。
import type { Settings } from '../../shared/domain'
import type { AppState } from '../../shared/ipc-contract'

export interface AppStateParts {
  version: string
  platform: 'darwin' | 'win32'
  /** Mac 以外は null */
  inApplicationsFolder: boolean | null
  settings: Settings
  loginItemEnabled: boolean
  auth: AppState['auth']
  ingest: AppState['ingest']
  desktopNotification: AppState['desktopNotification']
  update?: AppState['update']
  prList: AppState['prList']
}

export function buildAppState(parts: AppStateParts): AppState {
  return {
    appInfo: {
      version: parts.version,
      platform: parts.platform,
      inApplicationsFolder: parts.inApplicationsFolder,
    },
    auth: parts.auth,
    ingest: parts.ingest,
    desktopNotification: parts.desktopNotification,
    settings: parts.settings,
    loginItem: { enabled: parts.loginItemEnabled },
    // 使い始めの案内を終えていなければ出す（component-frontend.md 1.）
    onboardingRequired: parts.settings.onboarding.completedAt === undefined,
    ...(parts.update === undefined ? {} : { update: parts.update }),
    prList: parts.prList,
  }
}

/** 状態を持ち、変わったときだけ onChange を呼ぶ（state:changed を送るため） */
export class AppStateHolder {
  private parts: AppStateParts
  private state: AppState

  constructor(
    parts: AppStateParts,
    private readonly onChange: (state: AppState) => void,
  ) {
    this.parts = parts
    this.state = buildAppState(parts)
  }

  get(): AppState {
    return this.state
  }

  update(change: Partial<AppStateParts>): void {
    this.parts = { ...this.parts, ...change }
    const next = buildAppState(this.parts)
    if (JSON.stringify(next) === JSON.stringify(this.state)) return
    this.state = next
    this.onChange(next)
  }
}
