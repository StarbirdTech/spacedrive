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
import type { Device } from "@sd/ts-client";
import { getDeviceIcon } from "@sd/ts-client";
import { SettingsGroup, SettingsRow } from "../../components/primitive";

export function DeviceDetailsScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const params = useLocalSearchParams<{ deviceId: string; name: string }>();

	const deviceId = params.deviceId;
	const deviceName = params.name || "Device";

	const { data: devices } = useNormalizedQuery<any, Device[]>({
		wireMethod: "query:devices.list",
		input: {
			include_offline: true,
			include_details: true,
			show_paired: true,
		},
		resourceType: "device",
	});

	const device = devices?.find((d) => d.id === deviceId);
	// Cast to ImageSourcePropType since getDeviceIcon returns imported PNG modules
	const deviceIconSrc = device
		? (getDeviceIcon(device as any) as ImageSourcePropType)
		: null;

	const handleBack = useCallback(() => {
		router.back();
	}, [router]);

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
							{deviceName}
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
				{device ? (
					<>
						{/* Device Icon and Status */}
						<View className="items-center mb-6">
							{deviceIconSrc && (
								<Image
									source={deviceIconSrc}
									className="w-20 h-20 mb-4"
									style={{ resizeMode: "contain" }}
								/>
							)}
							<Text className="text-ink text-xl font-bold">
								{device.name}
							</Text>
							<View className="flex-row items-center mt-2">
								<View
									className={`w-2 h-2 rounded-full mr-2 ${
										device.is_connected
											? "bg-green-500"
											: "bg-gray-500"
									}`}
								/>
								<Text className="text-ink-dull">
									{device.is_current
										? "This device"
										: device.is_connected
											? "Online"
											: "Offline"}
								</Text>
							</View>
						</View>

						{/* Device Information */}
						<SettingsGroup header="Device Information">
							<SettingsRow
								label="Device ID"
								description={device.id}
								isFirst
							/>
							{device.os && (
								<SettingsRow
									label="Operating System"
									description={device.os}
								/>
							)}
							{device.hardware_model && (
								<SettingsRow
									label="Hardware Model"
									description={device.hardware_model}
								/>
							)}
							<SettingsRow
								label="Status"
								description={
									device.is_current
										? "Current device"
										: device.is_connected
											? "Connected"
											: "Disconnected"
								}
								isLast
							/>
						</SettingsGroup>

						{/* Storage Information - if available */}
						{device.boot_disk_capacity_bytes && (
							<View className="mt-4">
								<SettingsGroup header="Storage">
									<SettingsRow
										label="Boot Disk Capacity"
										description={formatBytes(
											device.boot_disk_capacity_bytes
										)}
										isFirst
										isLast
									/>
								</SettingsGroup>
							</View>
						)}
					</>
				) : (
					<View className="items-center justify-center py-20">
						<Text className="text-ink-dull">Device not found</Text>
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
