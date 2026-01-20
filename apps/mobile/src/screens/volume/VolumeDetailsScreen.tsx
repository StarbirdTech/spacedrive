import React, { useCallback } from "react";
import {
	View,
	Text,
	ScrollView,
	Pressable,
	Image,
	ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useNormalizedQuery } from "../../client";
import type { Volume } from "@sd/ts-client";
import { getVolumeIcon } from "@sd/ts-client";
import { SettingsGroup, SettingsRow } from "../../components/primitive";

export function VolumeDetailsScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const params = useLocalSearchParams<{ volumeId: string; name: string }>();

	const volumeId = params.volumeId;
	const volumeName = params.name || "Volume";

	const { data: volumesData } = useNormalizedQuery<any, { volumes: Volume[] }>({
		wireMethod: "query:volumes.list",
		input: { filter: "All" },
		resourceType: "volume",
	});

	const volume = volumesData?.volumes?.find((v) => v.id === volumeId);
	// Cast the icon since getVolumeIcon returns imported PNG modules
	const volumeIconSrc = volume
		? (getVolumeIcon({
				mount_point: volume.mount_point,
				volume_type: volume.volume_type as
					| "Internal"
					| "External"
					| "Removable"
					| undefined,
			}) as ImageSourcePropType)
		: null;

	const handleBack = useCallback(() => {
		router.back();
	}, [router]);

	const usedSpace = volume
		? volume.total_capacity - volume.available_space
		: 0;
	const usagePercent = volume
		? Math.round((usedSpace / volume.total_capacity) * 100)
		: 0;

	return (
		<View className="flex-1 bg-app">
			{/* Header */}
			<View
				className="bg-app-box border-b border-app-line"
				style={{ paddingTop: insets.top }}
			>
				<View className="flex-row items-center px-4 py-3">
					<Pressable
						onPress={handleBack}
						className="mr-3 p-2 -ml-2 active:bg-app-hover rounded-lg"
					>
						<Text className="text-accent text-base">← Back</Text>
					</Pressable>
					<View className="flex-1">
						<Text
							className="text-ink text-lg font-semibold"
							numberOfLines={1}
						>
							{volumeName}
						</Text>
					</View>
				</View>
			</View>

			<ScrollView
				className="flex-1"
				contentContainerStyle={{
					paddingTop: 16,
					paddingBottom: insets.bottom + 20,
					paddingHorizontal: 16,
				}}
			>
				{volume ? (
					<>
						{/* Volume Icon and Status */}
						<View className="items-center mb-6">
							{volumeIconSrc && (
								<Image
									source={volumeIconSrc}
									className="w-20 h-20 mb-4"
									style={{ resizeMode: "contain" }}
								/>
							)}
							<Text className="text-ink text-xl font-bold">
								{volume.display_name || volume.name}
							</Text>
							<View className="flex-row items-center mt-2">
								<View
									className={`w-2 h-2 rounded-full mr-2 ${
										volume.is_mounted
											? "bg-green-500"
											: "bg-gray-500"
									}`}
								/>
								<Text className="text-ink-dull">
									{volume.is_mounted ? "Mounted" : "Unmounted"}
								</Text>
								{volume.is_tracked && (
									<View className="ml-2 px-2 py-0.5 bg-accent/20 rounded">
										<Text className="text-accent text-xs">
											Tracked
										</Text>
									</View>
								)}
							</View>
						</View>

						{/* Storage Usage */}
						<View className="bg-app-box rounded-2xl p-4 mb-4">
							<Text className="text-ink-dull text-sm mb-2">
								Storage Usage
							</Text>
							<View className="flex-row justify-between mb-2">
								<Text className="text-ink text-lg font-semibold">
									{formatBytes(usedSpace)} used
								</Text>
								<Text className="text-ink-dull text-lg">
									{formatBytes(volume.available_space)} free
								</Text>
							</View>
							{/* Progress bar */}
							<View className="h-2 bg-app-line rounded-full overflow-hidden">
								<View
									className="h-full bg-accent rounded-full"
									style={{ width: `${usagePercent}%` }}
								/>
							</View>
							<Text className="text-ink-dull text-xs mt-2 text-center">
								{formatBytes(volume.total_capacity)} total •{" "}
								{usagePercent}% used
							</Text>
						</View>

						{/* Volume Information */}
						<SettingsGroup header="Volume Information">
							<SettingsRow
								label="Volume ID"
								description={volume.id}
								isFirst
							/>
							<SettingsRow
								label="Mount Point"
								description={volume.mount_point}
							/>
							{volume.file_system && (
								<SettingsRow
									label="File System"
									description={
										typeof volume.file_system === "string"
											? volume.file_system
											: (volume.file_system as { Other: string })
														.Other
									}
								/>
							)}
							{volume.disk_type && (
								<SettingsRow
									label="Disk Type"
									description={String(volume.disk_type)}
								/>
							)}
							{volume.volume_type && (
								<SettingsRow
									label="Volume Type"
									description={String(volume.volume_type)}
								/>
							)}
							<SettingsRow
								label="Read Only"
								description={volume.is_read_only ? "Yes" : "No"}
								isLast
							/>
						</SettingsGroup>

						{/* Actions */}
						{!volume.is_tracked && volume.is_mounted && (
							<View className="mt-4">
								<Pressable className="bg-accent rounded-xl py-3 px-4 active:bg-accent/80">
									<Text className="text-white text-center font-semibold">
										Track This Volume
									</Text>
								</Pressable>
								<Text className="text-ink-dull text-xs text-center mt-2">
									Tracking enables file indexing and sync
								</Text>
							</View>
						)}
					</>
				) : (
					<View className="items-center justify-center py-20">
						<Text className="text-ink-dull">Volume not found</Text>
					</View>
				)}
			</ScrollView>
		</View>
	);
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
