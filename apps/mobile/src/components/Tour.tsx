import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { CopilotProvider, useCopilot } from "react-native-copilot";

/** Dark, on-brand tour tooltip (replaces copilot's default light card). */
function TourTooltip() {
  const { currentStep, isFirstStep, isLastStep, goToNext, goToPrev, stop } = useCopilot();
  return (
    <View>
      <Text className="text-[14px] leading-[20px] text-fg">{currentStep?.text}</Text>
      <View className="mt-3 flex-row items-center justify-between">
        <Pressable onPress={() => void stop()} className="active:opacity-60">
          <Text className="text-[13px] text-fg-faint">Skip</Text>
        </Pressable>
        <View className="flex-row items-center gap-5">
          {!isFirstStep ? (
            <Pressable onPress={() => void goToPrev()} className="active:opacity-60">
              <Text className="text-[13px] text-fg-muted">Back</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void (isLastStep ? stop() : goToNext())} className="active:opacity-60">
            <Text className="text-[13px] font-semibold text-accent">{isLastStep ? "Got it" : "Next"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function TourProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotProvider
      overlay="svg"
      animated
      stopOnOutsideClick
      backdropColor="rgba(0,0,0,0.78)"
      arrowColor="#1b1b22"
      tooltipStyle={{ backgroundColor: "#1b1b22", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, width: 280 }}
      tooltipComponent={TourTooltip}
      labels={{ skip: "Skip", previous: "Back", next: "Next", finish: "Got it" }}
    >
      {children}
    </CopilotProvider>
  );
}
