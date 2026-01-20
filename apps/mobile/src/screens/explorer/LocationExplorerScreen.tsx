import React, { useCallback } from "react";
import {
	View,
	Text,
	FlatList,
	Pressable,
	Image,
	ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useNormalizedQuery } from "../../client";
import type { File, SdPath, DirectoryListingOutput } from "@sd/ts-client";
import FolderIcon from "@sd/assets/icons/Folder.png";
import FileIcon from "@sd/assets/icons/Document.png";
import { useExplorerStore } from "../../stores/explorer";

function getPathString(sdPath: SdPath): string {
	if ("Physical" in sdPath) {
		return sdPath.Physical.path;
	}
	if ("Cloud" in sdPath) {
		return sdPath.Cloud.path;
	}
	return "";
}

function FileItem({
	file,
	onPress,
}: {
	file: File;
	onPress: (file: File) => void;
}) {
	const isDirectory = file.kind === "Directory";

	return (
		<Pressable
			onPress={() => onPress(file)}
			className="flex-row items-center px-4 py-3 bg-app-box active:bg-app-hover border-b border-app-line"
		>
			<Image
				source={isDirectory ? FolderIcon : FileIcon}
				className="w-8 h-8 mr-3"
				style={{ resizeMode: "contain" }}
			/>
			<View className="flex-1">
				<Text className="text-ink text-base" numberOfLines={1}>
					{file.name}
				</Text>
				{!isDirectory && file.size != null && (
					<Text className="text-ink-dull text-xs mt-0.5">
						{formatBytes(file.size)}
					</Text>
				)}
			</View>
			{isDirectory && (
				<View className="w-2 h-2 border-r-2 border-t-2 border-ink-dull rotate-45" />
			)}
		</Pressable>
	);
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function LocationExplorerScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const params = useLocalSearchParams<{
		locationId: string;
		name: string;
		path: string;
		deviceSlug: string;
	}>();

	const locationId = params.locationId;
	const locationName = params.name || "Location";
	const currentPath = params.path || "/";
	const deviceSlug = params.deviceSlug || "local";

	const { setCurrentLocation, setCurrentPath } = useExplorerStore();

	// Build the SdPath for the query using the device slug from the location
	const { data, isLoading, error } = useNormalizedQuery<
		any,
		DirectoryListingOutput
	>({
		wireMethod: "query:files.directory_listing",
		input: {
			path: {
				Physical: {
					device_slug: deviceSlug,
					path: currentPath,
				},
			},
			limit: 100,
			include_hidden: false,
			sort_by: "name",
			folders_first: true,
		},
		resourceType: "file",
	});

	// Debug logging
	console.log("[LocationExplorer] Query params:", {
		deviceSlug,
		currentPath,
		isLoading,
		error: error?.message,
		dataKeys: data ? Object.keys(data) : null,
		filesCount: data?.files?.length,
	});

	const handleFilePress = useCallback(
		(file: File) => {
			if (file.kind === "Directory") {
				// Navigate deeper into the directory
				const newPath = getPathString(file.sd_path);
				router.push({
					pathname: "/location/[locationId]",
					params: {
						locationId,
						name: file.name,
						path: newPath,
						deviceSlug: deviceSlug,
					},
				});
			} else {
				// TODO: Open file preview
				console.log("Open file:", file.name);
			}
		},
		[locationId, deviceSlug, router]
	);

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
							{locationName}
						</Text>
						<Text className="text-ink-dull text-xs" numberOfLines={1}>
							{currentPath}
						</Text>
					</View>
				</View>
			</View>

			{/* Content */}
			{isLoading ? (
				<View className="flex-1 items-center justify-center">
					<ActivityIndicator size="large" color="hsl(220, 90%, 56%)" />
					<Text className="text-ink-dull mt-4">Loading...</Text>
				</View>
			) : error ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="text-ink-dull text-center">
						Failed to load directory contents
					</Text>
					<Text className="text-ink-faint text-xs text-center mt-2">
						{String(error)}
					</Text>
				</View>
			) : data?.files && data.files.length > 0 ? (
				<FlatList
					data={data.files}
					keyExtractor={(item) => item.id}
					renderItem={({ item }) => (
						<FileItem file={item} onPress={handleFilePress} />
					)}
					contentContainerStyle={{
						paddingBottom: insets.bottom + 20,
					}}
				/>
			) : (
				<View className="flex-1 items-center justify-center px-4">
					<Text className="text-ink-dull">This folder is empty</Text>
					<Text className="text-ink-faint text-xs text-center mt-4">
						Path: {currentPath}
					</Text>
					<Text className="text-ink-faint text-xs text-center mt-1">
						Device: {deviceSlug}
					</Text>
					{data && (
						<Text className="text-ink-faint text-xs text-center mt-1">
							Response keys: {Object.keys(data).join(", ") || "none"}
						</Text>
					)}
				</View>
			)}
		</View>
	);
}
