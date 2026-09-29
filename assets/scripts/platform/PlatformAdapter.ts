export type RewardedVideoResult = 'completed' | 'skipped' | 'unavailable';

export interface PlatformSystemInfo {
    platform: 'wechat' | 'web';
    language: string;
    screenWidth: number;
    screenHeight: number;
}

/** Runtime implementations are added in the platform integration stage. */
export interface PlatformAdapter {
    saveLocal(key: string, value: string): void;
    loadLocal(key: string): string | null;
    vibrateShort(): void;
    share(): Promise<boolean>;
    showRewardedVideo(): Promise<RewardedVideoResult>;
    getSystemInfo(): PlatformSystemInfo;
}
