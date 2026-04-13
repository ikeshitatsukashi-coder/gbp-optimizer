# Google Cloud Platform セットアップ手順

## 1. Google Cloud プロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 右上の「プロジェクトを選択」→「新しいプロジェクト」をクリック
3. プロジェクト名: `gbp-optimizer`（任意）
4. 「作成」をクリック

## 2. API を有効化

Google Cloud Console の「APIとサービス」→「ライブラリ」で以下を検索して有効化:

- **Google My Business Account Management API**
- **Google My Business Business Information API**  
- **Business Profile Performance API**
- **Google My Business API** (v4 - レビュー/投稿用)

## 3. OAuth 同意画面の設定

1. 「APIとサービス」→「OAuth 同意画面」
2. ユーザータイプ: 「外部」を選択（テスト段階）
3. 必要情報を入力:
   - アプリ名: `GBP Optimizer`
   - ユーザーサポートメール: あなたのメール
   - デベロッパーの連絡先: あなたのメール
4. スコープの追加:
   - `https://www.googleapis.com/auth/business.manage`
5. テストユーザーにあなたのGoogleアカウントを追加

## 4. OAuth 2.0 クライアントID 作成

1. 「APIとサービス」→「認証情報」→「認証情報を作成」
2. 「OAuth クライアント ID」を選択
3. アプリケーションの種類: 「ウェブアプリケーション」
4. 名前: `GBP Optimizer Web`
5. 承認済みのリダイレクトURI:
   - ローカル: `http://localhost:3000/api/auth/callback/google`
   - 本番: `https://gbp-optimizer-phi.vercel.app/api/auth/callback/google`
6. 「作成」→ クライアントIDとシークレットをメモ

## 5. 環境変数の設定

### ローカル開発

```bash
cp .env.local.example .env.local
```

`.env.local` を編集:

```
NEXTAUTH_SECRET=<openssl rand -base64 32 で生成した値>
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<Step 4のクライアントID>
GOOGLE_CLIENT_SECRET=<Step 4のシークレット>
NEXT_PUBLIC_USE_API=true
```

### Vercel デプロイ

Vercel ダッシュボード → Settings → Environment Variables に同じ値を設定。
`NEXTAUTH_URL` は `https://gbp-optimizer-phi.vercel.app` に変更。

## 6. Googleビジネスプロフィールのオーナー確認

API でデータを取得するには、対象のGBPリスティングのオーナーまたは管理者である必要があります。

1. [Google Business Profile Manager](https://business.google.com/) にログイン
2. 対象のビジネスが表示されていることを確認
3. 表示されない場合は「ビジネスを追加」からオーナー確認を実施

## 7. 動作確認

```bash
npm run dev
```

1. http://localhost:3000 にアクセス
2. ログインボタンからGoogleアカウントでログイン
3. アカウントとロケーションが取得できることを確認

## トラブルシューティング

- **403 エラー**: APIが有効化されていない、またはスコープが不足
- **401 エラー**: アクセストークンが期限切れ。再ログインで解決
- **404 エラー**: ロケーション名が間違っている可能性
- **テストユーザーエラー**: OAuth同意画面のテストユーザーに追加が必要
