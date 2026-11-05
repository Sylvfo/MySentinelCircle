import { useEffect, useState } from 'react';
import { fetchAvatarBlob } from './api/user';

// Profile photos as blob URLs, cached for the whole session. The key
// includes the photo's file name (avatarPath), so a new photo is a new key
// and an old one is never shown again. One request per photo, shared by
// every place that shows it.
const cache = new Map<string, Promise<string | null>>();

function loadAvatar(userId: string, avatarPath: string): Promise<string | null> {
  const key = `${userId}:${avatarPath}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = fetchAvatarBlob(userId)
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => null);
    cache.set(key, entry);
  }
  return entry;
}

// null while loading, when there's no photo, or when it can't be seen.
export function useAvatarUrl(userId: string | undefined, avatarPath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!userId || !avatarPath) return;
    let alive = true;
    void loadAvatar(userId, avatarPath).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [userId, avatarPath]);

  return url;
}
