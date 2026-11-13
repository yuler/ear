import { mount, Text, View } from "nsh";
import { Button } from "nsh/base";
import {
  globalUpdateAvailable,
  globalUpdateError,
  globalUpdateModalOpen,
  globalUpdateResult,
  globalUpdateStatus,
} from "../updater";
import { UpdateModal } from "./UpdateModal";

export function UpdateModalFixture() {
  const triggerUpdate = () => {
    globalUpdateResult.set({
      hasUpdate: true,
      isIncremental: true,
      currentVersion: "0.0.22",
      latestVersion: "0.0.25",
      currentBuild: 39,
      latestBuild: 42,
      changelog: "",
      changelogItems: [
        "🐛 [macos] Fix sidebar traffic-light overlap and add macOS app icon (#21)",
        "🐛 [release] Fix macOS bundle CLI overwrite and version injection (#20)",
        "✨ [shortcuts] Universal keyboard navigation and cheat sheet modal (#19)",
      ],
    });
    globalUpdateAvailable.set(true);
    globalUpdateStatus.set("available");
    globalUpdateError.set(null);
    globalUpdateModalOpen.set(true);
  };

  return (
    <View class="relative h-full w-full p-4">
      <Button onPress={triggerUpdate}>
        <Text>Trigger Update</Text>
      </Button>
      <If when={!globalUpdateModalOpen()}>
        <Text>Modal Closed</Text>
      </If>
      <UpdateModal />
    </View>
  );
}

mount(UpdateModalFixture);
