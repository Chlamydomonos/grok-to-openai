import fs from 'fs';
import path from 'path';
import { exit } from 'process';
import yaml from 'yaml';
import { dataDir } from './data-dir';

type Config = {
    port: number;
    cookieQuota: number;
    quotaRefreshTime: number;
    customCookieMode?: boolean;
    roles: Record<string, boolean>;
} & (
    | {
          useHttpProxy: true;
          httpProxyUrl: string;
      }
    | {
          useHttpProxy?: false;
      }
);

const checkConfig = (config: any): config is Config => {
    if (config.port === undefined) {
        return false;
    }
    if (config.cookieQuota === undefined) {
        return false;
    }
    if (config.quotaRefreshTime === undefined) {
        return false;
    }
    if (config.useHttpProxy && config.httpProxyUrl === undefined) {
        return false;
    }
    if (config.roles === undefined) {
        return false;
    }

    return true;
};

const loadConfig = () => {
    const configPath = path.resolve(dataDir, 'config.yml');
    if (!fs.existsSync(configPath)) {
        console.log('\x1B[31mConfig file does not exist, try regenerate with pnpm build\x1B[0m');
        exit(-1);
    }
    try {
        const config = yaml.parse(fs.readFileSync(configPath).toString());
        if (!checkConfig(config)) {
            throw new Error();
        }
        return config;
    } catch (e) {
        console.log('\x1B[31mBroken config, try delete config.yml and regenerate with pnpm build\n\x1B[0m');
        exit(-1);
    }
};

export const config = loadConfig();
