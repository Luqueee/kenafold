cask "kenafold" do
  version "0.1.0"
  # Actualizar SHA256 después de cada release:
  # shasum -a 256 Kenafold_0.1.0_universal.dmg
  sha256 :no_check

  url "https://github.com/Luqueee/file-explorer/releases/download/v#{version}/Kenafold_#{version}_universal.dmg"
  name "Kenafold"
  desc "File manager for macOS with dual-pane, tags, and archive support"
  homepage "https://github.com/Luqueee/file-explorer"

  depends_on macos: ">= :monterey"

  app "Kenafold.app"

  zap trash: [
    "~/Library/Application Support/com.luqueee.Kenafold",
    "~/Library/Preferences/com.luqueee.Kenafold.plist",
    "~/Library/Caches/com.luqueee.Kenafold",
    "~/Library/Saved Application State/com.luqueee.Kenafold.savedState",
  ]
end
