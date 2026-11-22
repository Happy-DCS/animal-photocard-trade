import { app } from "./app.js";
import { LOCAL_UPLOAD_DIR, isLocalStorage } from "./lib/image-storage.js";

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
  console.log(
    isLocalStorage
      ? `image storage: local (${LOCAL_UPLOAD_DIR}) — SUPABASE_URL/ANON_KEY 미설정`
      : "image storage: supabase",
  );
});
